import type { User } from '@root/types/config.types.js'
import type { RadarrItem, RadarrMovie } from '@root/types/radarr.types.js'
import type { SonarrItem, SonarrSeries } from '@root/types/sonarr.types.js'
import {
  extractRadarrId,
  extractSonarrId,
  getGuidMatchScore,
  parseGuids,
} from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * Tag structure returned from Sonarr/Radarr APIs
 */
interface Tag {
  id: number
  label: string
}

/**
 * Type for tagging results
 */
interface TaggingResults {
  tagged: number
  skipped: number
  failed: number
}

/**
 * Type for tag cleanup results
 */
interface TagCleanupResults {
  removed: number
  skipped: number
  failed: number
  instances: number
}

/**
 * Type for orphaned tag cleanup results
 */
interface OrphanedTagCleanupResults {
  radarr: TagCleanupResults
  sonarr: TagCleanupResults
}

/**
 * Type for a generic media service (Sonarr or Radarr)
 */
interface MediaService {
  getTags(): Promise<Tag[]>
  createTag(label: string): Promise<Tag>
  updateSeriesTags?(seriesId: number, tagIds: number[]): Promise<void>
  updateMovieTags?(movieId: number, tagIds: number[]): Promise<void>
}

/**
 * Service to manage user tagging for media in Sonarr and Radarr
 */
export class UserTagService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  /**
   * Get all users with sync enabled
   */
  private async getSyncEnabledUsers(): Promise<User[]> {
    const allUsers = await this.fastify.db.getAllUsers()
    return allUsers.filter((user) => user.can_sync)
  }

  /**
   * Get config value for tagging users in Sonarr
   */
  private get tagUsersInSonarr(): boolean {
    return this.fastify.config.tagUsersInSonarr
  }

  /**
   * Get config value for tagging users in Radarr
   */
  private get tagUsersInRadarr(): boolean {
    return this.fastify.config.tagUsersInRadarr
  }

  /**
   * Get config value for cleaning up orphaned tags
   */
  private get cleanupOrphanedTags(): boolean {
    return this.fastify.config.cleanupOrphanedTags
  }

  /**
   * Get config value for tag prefix
   */
  private get tagPrefix(): string {
    return this.fastify.config.tagPrefix || 'pulsarr:user'
  }

  /**
   * Get config value for removed tag mode
   */
  private get removedTagMode(): 'remove' | 'keep' | 'special-tag' {
    return this.fastify.config.removedTagMode || 'remove'
  }

  /**
   * Get config value for removed tag prefix
   */
  private get removedTagPrefix(): string {
    return this.fastify.config.removedTagPrefix || 'pulsarr:removed'
  }

  /**
   * Fetch all existing tags and create any missing ones for all users
   * This ensures we only attempt to create each tag once
   *
   * @param service - The Sonarr/Radarr service with getTags and createTag methods
   * @param users - Array of users
   * @returns Maps of tag labels to IDs and IDs to labels, plus counts of failed and created tags
   */
  private async ensureUserTags(
    service: MediaService,
    users: User[],
  ): Promise<{
    tagLabelMap: Map<string, number>
    tagIdMap: Map<number, string>
    failedCount: number
    createdCount: number
  }> {
    // Get ALL existing tags first
    const existingTags = await service.getTags()

    // Create maps for labels and IDs
    const tagLabelMap = new Map<string, number>()
    const tagIdMap = new Map<number, string>()
    let failedCount = 0
    let createdCount = 0

    for (const tag of existingTags) {
      const lowerLabel = tag.label.toLowerCase()
      tagLabelMap.set(lowerLabel, tag.id)
      tagIdMap.set(tag.id, lowerLabel)
    }

    // Determine which user tags need to be created
    const tagsToCreate: Array<{ user: User; label: string }> = []

    for (const user of users) {
      const tagLabel = this.getUserTagLabel(user)
      const lowerLabel = tagLabel.toLowerCase()

      if (!tagLabelMap.has(lowerLabel)) {
        tagsToCreate.push({ user, label: tagLabel })
      }
    }

    // Log summary of what we're about to do (changed to DEBUG)
    if (tagsToCreate.length > 0) {
      this.log.debug(`Need to create ${tagsToCreate.length} missing user tags`)
    } else {
      this.log.debug(
        `All user tags already exist (${existingTags.length} total tags)`,
      )
    }

    // Create missing tags one at a time
    for (const tagInfo of tagsToCreate) {
      try {
        const newTag = await service.createTag(tagInfo.label)
        const lowerLabel = tagInfo.label.toLowerCase()
        tagLabelMap.set(lowerLabel, newTag.id)
        tagIdMap.set(newTag.id, lowerLabel)
        createdCount++
        this.log.debug(
          `Created tag "${tagInfo.label}" with ID ${newTag.id} for user ${tagInfo.user.name}`,
        )
      } catch (error) {
        this.log.error(
          { error },
          `Failed to create tag "${tagInfo.label}" for user ${tagInfo.user.name}:`,
        )
        failedCount++
      }
    }

    return { tagLabelMap, tagIdMap, failedCount, createdCount }
  }

  /**
   * Create all necessary user tags in Sonarr instances
   *
   * @returns Results of tag creation operation
   */
  async createSonarrUserTags(): Promise<{
    created: number
    skipped: number
    failed: number
    instances: number
  }> {
    if (!this.tagUsersInSonarr) {
      this.log.debug('Sonarr user tagging disabled, skipping tag creation')
      return { created: 0, skipped: 0, failed: 0, instances: 0 }
    }

    const results = { created: 0, skipped: 0, failed: 0, instances: 0 }

    try {
      // Get all users with sync enabled
      const users = await this.getSyncEnabledUsers()

      // Get all Sonarr instances
      const sonarrManager = this.fastify.sonarrManager
      const sonarrInstances = await sonarrManager.getAllInstances()

      results.instances = sonarrInstances.length

      for (const instance of sonarrInstances) {
        try {
          const sonarrService = sonarrManager.getSonarrService(instance.id)

          if (!sonarrService) {
            this.log.warn(
              `Sonarr service for instance ${instance.name} not found, skipping tag creation`,
            )
            continue
          }

          // Use ensureUserTags to get/create all necessary tags
          const { failedCount, createdCount } = await this.ensureUserTags(
            sonarrService,
            users,
          )

          // Calculate skipped count correctly
          const skippedCount = users.length - createdCount - failedCount

          results.created += createdCount
          results.failed += failedCount
          results.skipped += Math.max(skippedCount, 0)

          this.log.info(
            `Processed user tags for Sonarr instance ${instance.name}: created: ${createdCount}, skipped: ${skippedCount}, failed: ${failedCount}`,
          )
        } catch (instanceError) {
          this.log.error(
            { error: instanceError },
            `Error processing tags for Sonarr instance ${instance.name}:`,
          )
        }
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error creating Sonarr user tags:')
      throw error
    }
  }

  /**
   * Create all necessary user tags in Radarr instances
   *
   * @returns Results of tag creation operation
   */
  async createRadarrUserTags(): Promise<{
    created: number
    skipped: number
    failed: number
    instances: number
  }> {
    if (!this.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping tag creation')
      return { created: 0, skipped: 0, failed: 0, instances: 0 }
    }

    const results = { created: 0, skipped: 0, failed: 0, instances: 0 }

    try {
      // Get all users with sync enabled
      const users = await this.getSyncEnabledUsers()

      // Get all Radarr instances
      const radarrManager = this.fastify.radarrManager
      const radarrInstances = await radarrManager.getAllInstances()

      results.instances = radarrInstances.length

      for (const instance of radarrInstances) {
        try {
          const radarrService = radarrManager.getRadarrService(instance.id)

          if (!radarrService) {
            this.log.warn(
              `Radarr service for instance ${instance.name} not found, skipping tag creation`,
            )
            continue
          }

          // Use ensureUserTags to get/create all necessary tags
          const { failedCount, createdCount } = await this.ensureUserTags(
            radarrService,
            users,
          )

          // Calculate skipped count correctly
          const skippedCount = users.length - createdCount - failedCount

          results.created += createdCount
          results.failed += failedCount
          results.skipped += Math.max(skippedCount, 0)

          this.log.info(
            `Processed user tags for Radarr instance ${instance.name}: created: ${createdCount}, skipped: ${skippedCount}, failed: ${failedCount}`,
          )
        } catch (instanceError) {
          this.log.error(
            { error: instanceError },
            `Error processing tags for Radarr instance ${instance.name}:`,
          )
        }
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error creating Radarr user tags:')
      throw error
    }
  }

  /**
   * Tag Sonarr content using pre-fetched data with batching
   * This is the integrated mode for use with the StatusService (internal only, no progress reporting)
   *
   * @param series All fetched series from Sonarr
   * @param watchlistItems All show watchlist items
   * @returns Results of tagging operation
   */
  async tagSonarrContentWithData(
    series: SonarrItem[],
    watchlistItems: Array<{
      id?: string | number
      user_id: number
      guids?: string[] | string
      title: string
    }>,
  ): Promise<TaggingResults> {
    if (!this.tagUsersInSonarr) {
      this.log.debug('Sonarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    const results: TaggingResults = { tagged: 0, skipped: 0, failed: 0 }

    try {
      // Get all users with sync enabled for tag lookup
      const users = await this.getSyncEnabledUsers()
      const userMap = new Map(users.map((user) => [user.id, user]))

      // Process each Sonarr instance in parallel
      const sonarrManager = this.fastify.sonarrManager
      const sonarrInstances = await sonarrManager.getAllInstances()

      const instancePromises = sonarrInstances.map(async (instance) => {
        try {
          const sonarrService = sonarrManager.getSonarrService(instance.id)
          if (!sonarrService) {
            this.log.warn(
              `Sonarr service for instance ${instance.name} not found, skipping tagging`,
            )
            return { tagged: 0, skipped: 0, failed: 0 }
          }

          // Get or create all necessary tags for this instance
          const { tagLabelMap, tagIdMap } = await this.ensureUserTags(
            sonarrService,
            users,
          )

          // Get series from this instance
          const instanceSeries = series.filter(
            (s) => s.sonarr_instance_id === instance.id,
          )

          // Check if the passed data already includes tags
          const hasTagsInData =
            instanceSeries.length > 0 && instanceSeries[0].tags !== undefined

          // Get ALL series details with tags - only if not already included
          let seriesDetailsMap: Map<
            number,
            (SonarrItem & { id: number }) | SonarrSeries
          >

          if (hasTagsInData) {
            // Use the data we already have with tags - need to extract IDs from GUIDs
            seriesDetailsMap = new Map()
            for (const series of instanceSeries) {
              const sonarrId = extractSonarrId(series.guids)
              if (sonarrId > 0) {
                seriesDetailsMap.set(sonarrId, { ...series, id: sonarrId })
              }
            }
          } else {
            // Fetch complete data from API
            const allSeriesDetails =
              await sonarrService.getFromSonarr<Array<SonarrSeries>>('series')
            seriesDetailsMap = new Map(allSeriesDetails.map((s) => [s.id, s]))
          }

          this.log.debug(
            `Processing ${instanceSeries.length} series in Sonarr instance ${instance.name} for bulk tagging`,
          )

          // Collect all updates that need to be made
          const bulkUpdates: Array<{ seriesId: number; tagIds: number[] }> = []
          const instanceResults = { tagged: 0, skipped: 0, failed: 0 }

          for (const show of instanceSeries) {
            try {
              // Find users who have this show in their watchlist (only sync-enabled users)
              const showUsers = new Set<number>()

              // Use weighting system to find best matches for each watchlist item
              const potentialMatches = watchlistItems
                .map((item) => ({
                  item,
                  score: getGuidMatchScore(
                    parseGuids(show.guids),
                    parseGuids(item.guids),
                  ),
                }))
                .filter((match) => match.score > 0)
                .sort((a, b) => b.score - a.score)

              for (const match of potentialMatches) {
                if (userMap.has(match.item.user_id)) {
                  showUsers.add(match.item.user_id)
                }
              }

              // Skip processing if no users have this in watchlist and we're in 'keep' mode
              if (showUsers.size === 0 && this.removedTagMode === 'keep') {
                instanceResults.skipped++
                continue
              }

              // Extract Sonarr ID
              const sonarrId = extractSonarrId(show.guids)
              if (sonarrId === 0) {
                this.log.debug(
                  `Could not extract Sonarr ID from show "${show.title}", skipping tagging`,
                )
                instanceResults.skipped++
                continue
              }

              // Get series details from our bulk fetch
              const seriesDetails = seriesDetailsMap.get(sonarrId)
              if (!seriesDetails) {
                this.log.debug(
                  `Series details not found for "${show.title}" (ID: ${sonarrId}), skipping`,
                )
                instanceResults.skipped++
                continue
              }

              // Get tag IDs for users - using our tag map
              const userTagIds: number[] = []
              for (const userId of showUsers) {
                const user = userMap.get(userId)
                if (user) {
                  const tagLabel = this.getUserTagLabel(user)
                  const tagId = tagLabelMap.get(tagLabel.toLowerCase())
                  if (tagId) {
                    userTagIds.push(tagId)
                  }
                }
              }

              // Get existing tags and prepare new tag set
              const existingTags = seriesDetails.tags || []

              // Clean up any existing "removed" tags when users are re-adding content
              const removedTagIds = existingTags.filter((tagId: number) => {
                const tagLabel = tagIdMap.get(tagId)
                return tagLabel
                  ?.toLowerCase()
                  .startsWith(this.removedTagPrefix.toLowerCase())
              })

              let cleanedExistingTags = existingTags
              if (userTagIds.length > 0 && removedTagIds.length > 0) {
                this.log.debug(
                  `Cleaning up ${removedTagIds.length} removed tags for re-added content "${show.title}"`,
                )
                cleanedExistingTags = existingTags.filter(
                  (tagId: number) => !removedTagIds.includes(tagId),
                )
              }

              // Handle tags based on configuration mode
              let newTags: number[]

              if (this.removedTagMode === 'keep') {
                // Simply add any missing user tags, don't remove any
                newTags = [...new Set([...cleanedExistingTags, ...userTagIds])]
              } else if (this.removedTagMode === 'special-tag') {
                // Find non-user tags to preserve
                const nonUserTagIds = cleanedExistingTags.filter(
                  (tagId: number) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  },
                )

                // Find user tags that are being removed
                const removedUserTagIds = cleanedExistingTags.filter(
                  (tagId: number) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return (
                      tagLabel &&
                      this.isAppUserTag(tagLabel) &&
                      !userTagIds.includes(tagId)
                    )
                  },
                )

                // If we have tags being removed, add special "removed" tag
                if (removedUserTagIds.length > 0) {
                  try {
                    // Get or create the "removed" tag using our helper
                    const removedTagId = await this.ensureRemovedTag(
                      sonarrService,
                      tagLabelMap,
                      tagIdMap,
                      `show "${show.title}"`,
                    )

                    // Combine non-user tags with current user tags and removed tag
                    newTags = [
                      ...new Set([
                        ...nonUserTagIds,
                        ...userTagIds,
                        removedTagId,
                      ]),
                    ]
                  } catch (tagError) {
                    this.log.error(
                      { error: tagError },
                      'Failed to create special removed tag. Cannot proceed with special-tag mode:',
                    )
                    throw tagError
                  }
                } else {
                  // No tags being removed, just use current tags
                  newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
                }
              } else {
                // Default 'remove' mode
                // Filter out any existing user tags and add current ones
                const nonUserTagIds = cleanedExistingTags.filter(
                  (tagId: number) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  },
                )

                // Combine non-user tags with new user tags
                newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
              }

              // Only collect for bulk update if tags have changed
              if (!this.arraysEqual(existingTags, newTags)) {
                bulkUpdates.push({ seriesId: sonarrId, tagIds: newTags })
                instanceResults.tagged++
              } else {
                instanceResults.skipped++
              }
            } catch (showError) {
              this.log.error(
                { error: showError },
                `Error processing show "${show.title}":`,
              )
              instanceResults.failed++
            }
          }

          // Perform bulk update if we have any updates to make
          if (bulkUpdates.length > 0) {
            try {
              await sonarrService.bulkUpdateSeriesTags(bulkUpdates)
              this.log.debug(
                `Bulk updated ${bulkUpdates.length} series in Sonarr instance ${instance.name}`,
              )
            } catch (bulkError) {
              this.log.error(
                { error: bulkError },
                `Bulk update failed for Sonarr instance ${instance.name}, falling back to individual updates:`,
              )

              // Fallback to individual updates
              for (const update of bulkUpdates) {
                try {
                  await sonarrService.updateSeriesTags(
                    update.seriesId,
                    update.tagIds,
                  )
                } catch (individualError) {
                  this.log.error(
                    { error: individualError },
                    `Individual update failed for series ID ${update.seriesId}:`,
                  )
                  instanceResults.failed++
                  // Don't decrement tagged - it was never successfully updated
                }
              }
            }
          }

          this.log.debug(
            `Completed bulk tagging for Sonarr instance ${instance.name}: Processed ${instanceSeries.length} series (tagged: ${instanceResults.tagged}, skipped: ${instanceResults.skipped}, failed: ${instanceResults.failed})`,
          )

          return instanceResults
        } catch (instanceError) {
          this.log.error(
            { error: instanceError },
            `Error processing Sonarr instance ${instance.name} for tagging:`,
          )
          return { tagged: 0, skipped: 0, failed: 0 }
        }
      })

      // Wait for all instances to complete in parallel
      const instanceResults = await Promise.all(instancePromises)

      // Aggregate results
      for (const instanceResult of instanceResults) {
        results.tagged += instanceResult.tagged
        results.skipped += instanceResult.skipped
        results.failed += instanceResult.failed
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error tagging Sonarr content:')
      throw error
    }
  }

  /**
   * Tag Radarr content using pre-fetched data with batching
   * This is the integrated mode for use with the StatusService (internal only, no progress reporting)
   *
   * @param movies All fetched movies from Radarr
   * @param watchlistItems All movie watchlist items
   * @returns Results of tagging operation
   */
  async tagRadarrContentWithData(
    movies: RadarrItem[],
    watchlistItems: Array<{
      id?: string | number
      user_id: number
      guids?: string[] | string
      title: string
    }>,
  ): Promise<TaggingResults> {
    if (!this.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    const results: TaggingResults = { tagged: 0, skipped: 0, failed: 0 }

    try {
      // Get all users with sync enabled for tag lookup
      const users = await this.getSyncEnabledUsers()
      const userMap = new Map(users.map((user) => [user.id, user]))

      // Process each Radarr instance in parallel
      const radarrManager = this.fastify.radarrManager
      const radarrInstances = await radarrManager.getAllInstances()

      const instancePromises = radarrInstances.map(async (instance) => {
        try {
          const radarrService = radarrManager.getRadarrService(instance.id)
          if (!radarrService) {
            this.log.warn(
              `Radarr service for instance ${instance.name} not found, skipping tagging`,
            )
            return { tagged: 0, skipped: 0, failed: 0 }
          }

          // Get or create all necessary tags for this instance
          const { tagLabelMap, tagIdMap } = await this.ensureUserTags(
            radarrService,
            users,
          )

          // Get movies from this instance
          const instanceMovies = movies.filter(
            (m) => m.radarr_instance_id === instance.id,
          )

          // Check if the passed data already includes tags
          const hasTagsInData =
            instanceMovies.length > 0 && instanceMovies[0].tags !== undefined

          // Get ALL movie details with tags - only if not already included
          let movieDetailsMap: Map<
            number,
            (RadarrItem & { id: number }) | RadarrMovie
          >

          if (hasTagsInData) {
            // Use the data we already have with tags - need to extract IDs from GUIDs
            movieDetailsMap = new Map()
            for (const movie of instanceMovies) {
              const radarrId = extractRadarrId(movie.guids)
              if (radarrId > 0) {
                movieDetailsMap.set(radarrId, { ...movie, id: radarrId })
              }
            }
          } else {
            // Fetch complete data from API
            const allMovieDetails =
              await radarrService.getFromRadarr<Array<RadarrMovie>>('movie')
            movieDetailsMap = new Map(allMovieDetails.map((m) => [m.id, m]))
          }

          this.log.debug(
            `Processing ${instanceMovies.length} movies in Radarr instance ${instance.name} for bulk tagging`,
          )

          // Collect all updates that need to be made
          const bulkUpdates: Array<{ movieId: number; tagIds: number[] }> = []
          const instanceResults = { tagged: 0, skipped: 0, failed: 0 }

          for (const movie of instanceMovies) {
            try {
              // Find users who have this movie in their watchlist (only sync-enabled users)
              const movieUsers = new Set<number>()

              // Use weighting system to find best matches for each watchlist item
              const potentialMatches = watchlistItems
                .map((item) => ({
                  item,
                  score: getGuidMatchScore(
                    parseGuids(movie.guids),
                    parseGuids(item.guids),
                  ),
                }))
                .filter((match) => match.score > 0)
                .sort((a, b) => b.score - a.score)

              for (const match of potentialMatches) {
                if (userMap.has(match.item.user_id)) {
                  movieUsers.add(match.item.user_id)
                }
              }

              // Skip processing if no users have this in watchlist and we're in 'keep' mode
              if (movieUsers.size === 0 && this.removedTagMode === 'keep') {
                instanceResults.skipped++
                continue
              }

              // Extract Radarr ID
              const radarrId = extractRadarrId(movie.guids)
              if (radarrId === 0) {
                this.log.debug(
                  `Could not extract Radarr ID from movie "${movie.title}", skipping tagging`,
                )
                instanceResults.skipped++
                continue
              }

              // Get movie details from our bulk fetch
              const movieDetails = movieDetailsMap.get(radarrId)
              if (!movieDetails) {
                this.log.debug(
                  `Movie details not found for "${movie.title}" (ID: ${radarrId}), skipping`,
                )
                instanceResults.skipped++
                continue
              }

              // Get tag IDs for users - using our tag map
              const userTagIds: number[] = []
              for (const userId of movieUsers) {
                const user = userMap.get(userId)
                if (user) {
                  const tagLabel = this.getUserTagLabel(user)
                  const tagId = tagLabelMap.get(tagLabel.toLowerCase())
                  if (tagId) {
                    userTagIds.push(tagId)
                  }
                }
              }

              // Get existing tags and prepare new tag set
              const existingTags = movieDetails.tags || []

              // Clean up any existing "removed" tags when users are re-adding content
              const removedTagIds = existingTags.filter((tagId: number) => {
                const tagLabel = tagIdMap.get(tagId)
                return tagLabel
                  ?.toLowerCase()
                  .startsWith(this.removedTagPrefix.toLowerCase())
              })

              let cleanedExistingTags = existingTags
              if (userTagIds.length > 0 && removedTagIds.length > 0) {
                this.log.debug(
                  `Cleaning up ${removedTagIds.length} removed tags for re-added content "${movie.title}"`,
                )
                cleanedExistingTags = existingTags.filter(
                  (tagId: number) => !removedTagIds.includes(tagId),
                )
              }

              // Handle tags based on configuration mode
              let newTags: number[]

              if (this.removedTagMode === 'keep') {
                // Simply add any missing user tags, don't remove any
                newTags = [...new Set([...cleanedExistingTags, ...userTagIds])]
              } else if (this.removedTagMode === 'special-tag') {
                // Find non-user tags to preserve
                const nonUserTagIds = cleanedExistingTags.filter(
                  (tagId: number) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  },
                )

                // Find user tags that are being removed
                const removedUserTagIds = cleanedExistingTags.filter(
                  (tagId: number) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return (
                      tagLabel &&
                      this.isAppUserTag(tagLabel) &&
                      !userTagIds.includes(tagId)
                    )
                  },
                )

                // If we have tags being removed, add special "removed" tag
                if (removedUserTagIds.length > 0) {
                  try {
                    // Get or create the "removed" tag using our helper
                    const removedTagId = await this.ensureRemovedTag(
                      radarrService,
                      tagLabelMap,
                      tagIdMap,
                      `movie "${movie.title}"`,
                    )

                    // Combine non-user tags with current user tags and removed tag
                    newTags = [
                      ...new Set([
                        ...nonUserTagIds,
                        ...userTagIds,
                        removedTagId,
                      ]),
                    ]
                  } catch (tagError) {
                    this.log.error(
                      { error: tagError },
                      'Failed to create special removed tag. Cannot proceed with special-tag mode:',
                    )
                    throw tagError
                  }
                } else {
                  // No tags being removed, just use current tags
                  newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
                }
              } else {
                // Default 'remove' mode
                // Filter out any existing user tags and add current ones
                const nonUserTagIds = cleanedExistingTags.filter(
                  (tagId: number) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  },
                )

                // Combine non-user tags with new user tags
                newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
              }

              // Only collect for bulk update if tags have changed
              if (!this.arraysEqual(existingTags, newTags)) {
                bulkUpdates.push({ movieId: radarrId, tagIds: newTags })
                instanceResults.tagged++
              } else {
                instanceResults.skipped++
              }
            } catch (movieError) {
              this.log.error(
                { error: movieError },
                `Error processing movie "${movie.title}":`,
              )
              instanceResults.failed++
            }
          }

          // Perform bulk update if we have any updates to make
          if (bulkUpdates.length > 0) {
            try {
              await radarrService.bulkUpdateMovieTags(bulkUpdates)
              this.log.debug(
                `Bulk updated ${bulkUpdates.length} movies in Radarr instance ${instance.name}`,
              )
            } catch (bulkError) {
              this.log.error(
                { error: bulkError },
                `Bulk update failed for Radarr instance ${instance.name}, falling back to individual updates:`,
              )

              // Fallback to individual updates
              for (const update of bulkUpdates) {
                try {
                  await radarrService.updateMovieTags(
                    update.movieId,
                    update.tagIds,
                  )
                } catch (individualError) {
                  this.log.error(
                    { error: individualError },
                    `Individual update failed for movie ID ${update.movieId}:`,
                  )
                  instanceResults.failed++
                  // Don't decrement tagged - it was never successfully updated
                }
              }
            }
          }

          this.log.debug(
            `Completed bulk tagging for Radarr instance ${instance.name}: Processed ${instanceMovies.length} movies (tagged: ${instanceResults.tagged}, skipped: ${instanceResults.skipped}, failed: ${instanceResults.failed})`,
          )

          return instanceResults
        } catch (instanceError) {
          this.log.error(
            { error: instanceError },
            `Error processing Radarr instance ${instance.name} for tagging:`,
          )
          return { tagged: 0, skipped: 0, failed: 0 }
        }
      })

      // Wait for all instances to complete in parallel
      const instanceResults = await Promise.all(instancePromises)

      // Aggregate results
      for (const instanceResult of instanceResults) {
        results.tagged += instanceResult.tagged
        results.skipped += instanceResult.skipped
        results.failed += instanceResult.failed
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error tagging Radarr content:')
      throw error
    }
  }

  /**
   * Sync all Sonarr items with user tags - fetches all data internally
   * This is the standalone mode for API calls - includes progress reporting
   *
   * @returns Results of tagging operation
   */
  async syncSonarrTags(): Promise<TaggingResults> {
    if (!this.tagUsersInSonarr) {
      this.log.debug('Sonarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    const operationId = `sonarr-tagging-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    try {
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'sonarr-tagging',
          phase: 'start',
          progress: 5,
          message: 'Starting Sonarr tag synchronization...',
        })
      }

      // Create user tags first
      await this.createSonarrUserTags()

      // Fetch all shows and series needed for tagging
      const existingSeries =
        await this.fastify.sonarrManager.fetchAllSeries(true)

      const watchlistItems = await this.fastify.db.getAllShowWatchlistItems()

      // Count total series to process for progress reporting
      const totalSeries = existingSeries.length

      // Apply tags to all series in one bulk operation
      const results = await this.tagSonarrContentWithData(
        existingSeries,
        watchlistItems,
      )

      // Update progress to completion
      if (emitProgress && totalSeries > 0) {
        this.fastify.progress.emit({
          operationId,
          type: 'sonarr-tagging',
          phase: 'tagging-series',
          progress: 95,
          message: `Tagged ${totalSeries}/${totalSeries} series`,
        })
      }

      // Final logging summary - keep this at INFO level
      this.log.info(
        `Completed tagging for Sonarr instance. Sonarr: Processed ${totalSeries} series (tagged: ${results.tagged}, skipped: ${results.skipped}, failed: ${results.failed})`,
      )

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'sonarr-tagging',
          phase: 'complete',
          progress: 100,
          message: `Completed Sonarr tag sync: tagged ${results.tagged} series, skipped ${results.skipped}, failed ${results.failed}`,
        })
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error syncing Sonarr tags:')

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'sonarr-tagging',
          phase: 'error',
          progress: 100,
          message: `Error syncing Sonarr tags: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      }

      throw error
    }
  }

  /**
   * Sync all Radarr items with user tags - fetches all data internally
   * This is the standalone mode for API calls - includes progress reporting
   *
   * @returns Results of tagging operation
   */
  async syncRadarrTags(): Promise<TaggingResults> {
    if (!this.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    const operationId = `radarr-tagging-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    try {
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'radarr-tagging',
          phase: 'start',
          progress: 5,
          message: 'Starting Radarr tag synchronization...',
        })
      }

      // Create user tags first
      await this.createRadarrUserTags()

      // Fetch all movies and watchlist items needed for tagging
      const existingMovies =
        await this.fastify.radarrManager.fetchAllMovies(true)

      const watchlistItems = await this.fastify.db.getAllMovieWatchlistItems()

      // Count total movies to process for progress reporting
      const totalMovies = existingMovies.length

      // Apply tags to all movies in one bulk operation
      const results = await this.tagRadarrContentWithData(
        existingMovies,
        watchlistItems,
      )

      // Update progress to completion
      if (emitProgress && totalMovies > 0) {
        this.fastify.progress.emit({
          operationId,
          type: 'radarr-tagging',
          phase: 'tagging-movies',
          progress: 95,
          message: `Tagged ${totalMovies}/${totalMovies} movies`,
        })
      }

      // Final logging summary - keep this at INFO level
      this.log.info(
        `Completed tagging for Radarr instance. Radarr: Processed ${totalMovies} movies (tagged: ${results.tagged}, skipped: ${results.skipped}, failed: ${results.failed})`,
      )

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'radarr-tagging',
          phase: 'complete',
          progress: 100,
          message: `Completed Radarr tag sync: tagged ${results.tagged} movies, skipped ${results.skipped}, failed ${results.failed}`,
        })
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error syncing Radarr tags:')

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'radarr-tagging',
          phase: 'error',
          progress: 100,
          message: `Error syncing Radarr tags: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      }

      throw error
    }
  }

  /**
   * Sync all tags (both Sonarr and Radarr) in parallel
   * This is the main method for API calls
   *
   * @returns Results of all tagging operations
   */
  async syncAllTags(): Promise<{
    sonarr: TaggingResults
    radarr: TaggingResults
    orphanedCleanup?: OrphanedTagCleanupResults
  }> {
    this.log.info('Starting complete user tag synchronization')

    try {
      // Run Sonarr and Radarr tag syncs in parallel
      const [sonarrResults, radarrResults] = await Promise.all([
        this.syncSonarrTags(),
        this.syncRadarrTags(),
      ])

      // Handle orphaned tag cleanup if enabled
      let orphanedCleanup: OrphanedTagCleanupResults | undefined

      if (this.cleanupOrphanedTags) {
        try {
          orphanedCleanup = await this.cleanupOrphanedUserTags()
          this.log.info('Completed orphaned user tag cleanup', {
            sonarr: {
              removed: orphanedCleanup.sonarr.removed,
              failed: orphanedCleanup.sonarr.failed,
            },
            radarr: {
              removed: orphanedCleanup.radarr.removed,
              failed: orphanedCleanup.radarr.failed,
            },
          })
        } catch (cleanupError) {
          this.log.error(
            { error: cleanupError },
            'Error during orphaned tag cleanup:',
          )
        }
      }

      this.log.info('User tag synchronization complete', {
        sonarr: {
          tagged: sonarrResults.tagged,
          skipped: sonarrResults.skipped,
          failed: sonarrResults.failed,
        },
        radarr: {
          tagged: radarrResults.tagged,
          skipped: radarrResults.skipped,
          failed: radarrResults.failed,
        },
      })

      return {
        sonarr: sonarrResults,
        radarr: radarrResults,
        orphanedCleanup,
      }
    } catch (error) {
      this.log.error({ error }, 'Error in tag synchronization:')
      throw error
    }
  }

  /**
   * Clean up orphaned user tags in parallel across Sonarr and Radarr instances
   * This improves the implementation by handling both services concurrently
   *
   * @returns Results of cleanup operation
   */
  async cleanupOrphanedUserTags(): Promise<OrphanedTagCleanupResults> {
    const results: OrphanedTagCleanupResults = {
      radarr: { removed: 0, skipped: 0, failed: 0, instances: 0 },
      sonarr: { removed: 0, skipped: 0, failed: 0, instances: 0 },
    }

    if (!this.cleanupOrphanedTags) {
      this.log.info('Orphaned tag cleanup is disabled by configuration')
      return results
    }

    try {
      // Get all current users with sync enabled
      const users = await this.getSyncEnabledUsers()
      const validUserTagLabels = new Set(
        users.map((user) => this.getUserTagLabel(user).toLowerCase()),
      )

      // Get managers and instances for both services
      const radarrManager = this.fastify.radarrManager
      const sonarrManager = this.fastify.sonarrManager

      const [radarrInstances, sonarrInstances] = await Promise.all([
        radarrManager.getAllInstances(),
        sonarrManager.getAllInstances(),
      ])

      results.radarr.instances = radarrInstances.length
      results.sonarr.instances = sonarrInstances.length

      // Run the cleanup for both services in parallel
      const [radarrResults, sonarrResults] = await Promise.all([
        this.cleanupOrphanedRadarrTags(radarrInstances, validUserTagLabels),
        this.cleanupOrphanedSonarrTags(sonarrInstances, validUserTagLabels),
      ])

      // Combine results
      results.radarr = radarrResults
      results.sonarr = sonarrResults

      return results
    } catch (error) {
      this.log.error({ error }, 'Error cleaning up orphaned user tags:')
      throw error
    }
  }

  /**
   * Remove all user tags from media items in Sonarr with batching and progress tracking
   *
   * @param deleteTagDefinitions Whether to delete the tag definitions after removing them from items
   * @returns Results of tag removal operation
   */
  async removeAllSonarrUserTags(deleteTagDefinitions = false): Promise<{
    itemsProcessed: number
    itemsUpdated: number
    tagsRemoved: number
    tagsDeleted: number
    failed: number
    instances: number
  }> {
    if (!this.tagUsersInSonarr) {
      this.log.debug('Sonarr user tagging disabled, skipping tag removal')
      return {
        itemsProcessed: 0,
        itemsUpdated: 0,
        tagsRemoved: 0,
        tagsDeleted: 0,
        failed: 0,
        instances: 0,
      }
    }

    const results = {
      itemsProcessed: 0,
      itemsUpdated: 0,
      tagsRemoved: 0,
      tagsDeleted: 0,
      failed: 0,
      instances: 0,
    }

    const operationId = `sonarr-tag-removal-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    try {
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'sonarr-tag-removal',
          phase: 'start',
          progress: 5,
          message: 'Starting Sonarr user tag removal...',
        })
      }

      // Get total series count and collect user tags across all instances
      const sonarrManager = this.fastify.sonarrManager
      const sonarrInstances = await sonarrManager.getAllInstances()
      results.instances = sonarrInstances.length

      // Collect all the series and tags data first
      const instancesData = await Promise.all(
        sonarrInstances.map(async (instance) => {
          try {
            const sonarrService = sonarrManager.getSonarrService(instance.id)
            if (!sonarrService) return null

            const tags = await sonarrService.getTags()
            const userTags = tags.filter((tag) => this.isAppUserTag(tag.label))

            if (userTags.length === 0) return null

            const allSeries = await sonarrService.fetchSeries(true)

            return {
              instance,
              service: sonarrService,
              userTags,
              series: Array.from(allSeries),
              userTagIds: userTags.map((tag) => tag.id),
            }
          } catch (error) {
            this.log.error(
              { error },
              `Error collecting data from instance ${instance.name}:`,
            )
            return null
          }
        }),
      )

      // Filter out null entries
      const validInstancesData = instancesData.filter(
        (data): data is NonNullable<typeof data> => data !== null,
      )

      // Calculate total series to process for progress reporting
      const totalSeries = validInstancesData.reduce(
        (sum, data) => sum + data.series.length,
        0,
      )

      let totalProcessedSeries = 0

      // Process each instance with bulk operations
      for (const instanceData of validInstancesData) {
        const { instance, service, userTags, series, userTagIds } = instanceData

        this.log.info(
          `Processing ${series.length} series in Sonarr instance ${instance.name} for tag removal`,
        )

        try {
          // Get all series with their current tags in bulk
          const allSeries = await service.getAllSeries()
          const seriesMap = new Map(allSeries.map((s) => [s.id, s]))

          // Collect bulk updates for series that have user tags to remove
          const bulkUpdates: Array<{ seriesId: number; tagIds: number[] }> = []
          let processedCount = 0
          let tagsRemovedCount = 0

          for (const item of series) {
            try {
              results.itemsProcessed++
              processedCount++

              // Extract Sonarr ID
              const sonarrId = extractSonarrId(item.guids)
              if (sonarrId === 0) {
                continue
              }

              // Get series details from our bulk fetch
              const seriesDetails = seriesMap.get(sonarrId)
              if (!seriesDetails) {
                this.log.debug(
                  `Series details not found for "${item.title}" (ID: ${sonarrId}), skipping`,
                )
                continue
              }

              const existingTags = seriesDetails.tags || []

              // Check if this series has any of our user tags
              const hasUserTags = existingTags.some((tagId: number) =>
                userTagIds.includes(tagId),
              )

              if (!hasUserTags) {
                continue
              }

              // Filter out user tags
              const newTags = existingTags.filter(
                (tagId: number) => !userTagIds.includes(tagId),
              )

              const tagsRemoved = existingTags.length - newTags.length
              tagsRemovedCount += tagsRemoved

              // Add to bulk updates
              bulkUpdates.push({
                seriesId: sonarrId,
                tagIds: newTags,
              })

              results.itemsUpdated++
            } catch (error) {
              this.log.error(
                { error },
                `Error processing series "${item.title}" for tag removal:`,
              )
              results.failed++
            }
          }

          results.tagsRemoved += tagsRemovedCount

          // Apply bulk updates with fallback to individual updates
          if (bulkUpdates.length > 0) {
            try {
              await service.bulkUpdateSeriesTags(bulkUpdates)
              this.log.info(
                `Bulk updated ${bulkUpdates.length} series in ${instance.name}, removed ${tagsRemovedCount} user tags`,
              )
            } catch (bulkError) {
              this.log.warn(
                `Bulk update failed for ${instance.name}, falling back to individual updates:`,
                bulkError,
              )

              // Fallback to individual updates
              for (const update of bulkUpdates) {
                try {
                  await service.updateSeriesTags(update.seriesId, update.tagIds)
                } catch (individualError) {
                  this.log.error(
                    { error: individualError },
                    `Failed to update series ${update.seriesId} individually:`,
                  )
                  results.failed++
                  // Don't decrement itemsUpdated - it was never successfully updated
                }
              }
            }
          }

          // Update progress
          totalProcessedSeries += processedCount

          if (emitProgress && totalSeries > 0) {
            const progress =
              5 + Math.floor((totalProcessedSeries / totalSeries) * 85)
            this.fastify.progress.emit({
              operationId,
              type: 'sonarr-tag-removal',
              phase: 'processing-series',
              progress: progress,
              message: `Processed ${processedCount}/${series.length} series in ${instance.name} (${totalProcessedSeries}/${totalSeries} total)`,
            })
          }
        } catch (instanceError) {
          this.log.error(
            { error: instanceError },
            `Error processing instance ${instance.name}:`,
          )
          results.failed += series.length
        }

        // Delete tag definitions if requested
        if (deleteTagDefinitions && userTags.length > 0) {
          if (emitProgress) {
            this.fastify.progress.emit({
              operationId,
              type: 'sonarr-tag-removal',
              phase: 'deleting-tags',
              progress: 90,
              message: `Deleting ${userTags.length} tag definitions from Sonarr instance ${instance.name}`,
            })
          }

          // Process tag deletions
          for (const tag of userTags) {
            try {
              await service.deleteTag(tag.id)
              results.tagsDeleted++
            } catch (error) {
              this.log.error(
                { error },
                `Error deleting tag ID ${tag.id} from Sonarr:`,
              )
            }
          }
        }
      }

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'sonarr-tag-removal',
          phase: 'complete',
          progress: 100,
          message: `Completed Sonarr tag removal: updated ${results.itemsUpdated} series, removed ${results.tagsRemoved} tags, deleted ${results.tagsDeleted} tag definitions`,
        })
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error removing Sonarr user tags:')

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'sonarr-tag-removal',
          phase: 'error',
          progress: 100,
          message: `Error removing Sonarr user tags: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      }

      throw error
    }
  }

  /**
   * Remove all user tags from media items in Radarr with batching and progress tracking
   *
   * @param deleteTagDefinitions Whether to delete the tag definitions after removing them from items
   * @returns Results of tag removal operation
   */
  async removeAllRadarrUserTags(deleteTagDefinitions = false): Promise<{
    itemsProcessed: number
    itemsUpdated: number
    tagsRemoved: number
    tagsDeleted: number
    failed: number
    instances: number
  }> {
    if (!this.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping tag removal')
      return {
        itemsProcessed: 0,
        itemsUpdated: 0,
        tagsRemoved: 0,
        tagsDeleted: 0,
        failed: 0,
        instances: 0,
      }
    }

    const results = {
      itemsProcessed: 0,
      itemsUpdated: 0,
      tagsRemoved: 0,
      tagsDeleted: 0,
      failed: 0,
      instances: 0,
    }

    const operationId = `radarr-tag-removal-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    try {
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'radarr-tag-removal',
          phase: 'start',
          progress: 5,
          message: 'Starting Radarr user tag removal...',
        })
      }

      // Get total movies count and collect user tags across all instances
      const radarrManager = this.fastify.radarrManager
      const radarrInstances = await radarrManager.getAllInstances()
      results.instances = radarrInstances.length

      // Collect all the movies and tags data first
      const instancesData = await Promise.all(
        radarrInstances.map(async (instance) => {
          try {
            const radarrService = radarrManager.getRadarrService(instance.id)
            if (!radarrService) return null

            const tags = await radarrService.getTags()
            const userTags = tags.filter((tag) => this.isAppUserTag(tag.label))

            if (userTags.length === 0) return null

            const allMovies = await radarrService.fetchMovies(true)

            return {
              instance,
              service: radarrService,
              userTags,
              movies: Array.from(allMovies),
              userTagIds: userTags.map((tag) => tag.id),
            }
          } catch (error) {
            this.log.error(
              { error },
              `Error collecting data from instance ${instance.name}:`,
            )
            return null
          }
        }),
      )

      // Filter out null entries
      const validInstancesData = instancesData.filter(
        (data): data is NonNullable<typeof data> => data !== null,
      )

      // Calculate total movies to process for progress reporting
      const totalMovies = validInstancesData.reduce(
        (sum, data) => sum + data.movies.length,
        0,
      )

      let totalProcessedMovies = 0

      // Process each instance with bulk operations
      for (const instanceData of validInstancesData) {
        const { instance, service, userTags, movies, userTagIds } = instanceData

        this.log.info(
          `Processing ${movies.length} movies in Radarr instance ${instance.name} for tag removal`,
        )

        try {
          // Get all movies with their current tags in bulk
          const allMovies = await service.getFromRadarr<RadarrMovie[]>('movie')
          const moviesMap = new Map(
            allMovies.map((m: RadarrMovie) => [m.id, m]),
          )

          // Collect bulk updates for movies that have user tags to remove
          const bulkUpdates: Array<{ movieId: number; tagIds: number[] }> = []
          let processedCount = 0
          let tagsRemovedCount = 0

          for (const item of movies) {
            try {
              results.itemsProcessed++
              processedCount++

              // Extract Radarr ID
              const radarrId = extractRadarrId(item.guids)
              if (radarrId === 0) {
                continue
              }

              // Get movie details from our bulk fetch
              const movieDetails = moviesMap.get(radarrId)
              if (!movieDetails) {
                this.log.debug(
                  `Movie details not found for "${item.title}" (ID: ${radarrId}), skipping`,
                )
                continue
              }

              const existingTags = movieDetails.tags || []

              // Check if this movie has any of our user tags
              const hasUserTags = existingTags.some((tagId: number) =>
                userTagIds.includes(tagId),
              )

              if (!hasUserTags) {
                continue
              }

              // Filter out user tags
              const newTags = existingTags.filter(
                (tagId: number) => !userTagIds.includes(tagId),
              )

              const tagsRemoved = existingTags.length - newTags.length
              tagsRemovedCount += tagsRemoved

              // Add to bulk updates
              bulkUpdates.push({
                movieId: radarrId,
                tagIds: newTags,
              })

              results.itemsUpdated++
            } catch (error) {
              this.log.error(
                { error },
                `Error processing movie "${item.title}" for tag removal:`,
              )
              results.failed++
            }
          }

          results.tagsRemoved += tagsRemovedCount

          // Apply bulk updates with fallback to individual updates
          if (bulkUpdates.length > 0) {
            try {
              await service.bulkUpdateMovieTags(bulkUpdates)
              this.log.info(
                `Bulk updated ${bulkUpdates.length} movies in ${instance.name}, removed ${tagsRemovedCount} user tags`,
              )
            } catch (bulkError) {
              this.log.warn(
                `Bulk update failed for ${instance.name}, falling back to individual updates:`,
                bulkError,
              )

              // Fallback to individual updates
              for (const update of bulkUpdates) {
                try {
                  await service.updateMovieTags(update.movieId, update.tagIds)
                } catch (individualError) {
                  this.log.error(
                    { error: individualError },
                    `Failed to update movie ${update.movieId} individually:`,
                  )
                  results.failed++
                  // Don't decrement itemsUpdated - it was never successfully updated
                }
              }
            }
          }

          // Update progress
          totalProcessedMovies += processedCount

          if (emitProgress && totalMovies > 0) {
            const progress =
              5 + Math.floor((totalProcessedMovies / totalMovies) * 85)
            this.fastify.progress.emit({
              operationId,
              type: 'radarr-tag-removal',
              phase: 'processing-movies',
              progress: progress,
              message: `Processed ${processedCount}/${movies.length} movies in ${instance.name} (${totalProcessedMovies}/${totalMovies} total)`,
            })
          }
        } catch (instanceError) {
          this.log.error(
            { error: instanceError },
            `Error processing instance ${instance.name}:`,
          )
          results.failed += movies.length
        }

        // Delete tag definitions if requested
        if (deleteTagDefinitions && userTags.length > 0) {
          if (emitProgress) {
            this.fastify.progress.emit({
              operationId,
              type: 'radarr-tag-removal',
              phase: 'deleting-tags',
              progress: 90,
              message: `Deleting ${userTags.length} tag definitions from Radarr instance ${instance.name}`,
            })
          }

          // Process tag deletions
          for (const tag of userTags) {
            try {
              await service.deleteTag(tag.id)
              results.tagsDeleted++
            } catch (error) {
              this.log.error(
                { error },
                `Error deleting tag ID ${tag.id} from Radarr:`,
              )
            }
          }
        }
      }

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'radarr-tag-removal',
          phase: 'complete',
          progress: 100,
          message: `Completed Radarr tag removal: updated ${results.itemsUpdated} movies, removed ${results.tagsRemoved} tags, deleted ${results.tagsDeleted} tag definitions`,
        })
      }

      return results
    } catch (error) {
      this.log.error({ error }, 'Error removing Radarr user tags:')

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'radarr-tag-removal',
          phase: 'error',
          progress: 100,
          message: `Error removing Radarr user tags: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      }

      throw error
    }
  }

  /**
   * Remove all user tags from all media items in both Sonarr and Radarr in parallel
   * Optionally delete the tag definitions themselves
   *
   * @param deleteTagDefinitions Whether to delete the tag definitions after removing them from media items
   * @returns Results of the removal operation
   */
  async removeAllUserTags(deleteTagDefinitions = false): Promise<{
    sonarr: {
      itemsProcessed: number
      itemsUpdated: number
      tagsRemoved: number
      tagsDeleted: number
      failed: number
      instances: number
    }
    radarr: {
      itemsProcessed: number
      itemsUpdated: number
      tagsRemoved: number
      tagsDeleted: number
      failed: number
      instances: number
    }
  }> {
    this.log.info(
      `Starting complete user tag removal in parallel (deleteDefinitions=${deleteTagDefinitions})`,
    )

    try {
      // Run both removals in parallel
      const [sonarrResults, radarrResults] = await Promise.all([
        this.removeAllSonarrUserTags(deleteTagDefinitions),
        this.removeAllRadarrUserTags(deleteTagDefinitions),
      ])

      const totalItemsUpdated =
        sonarrResults.itemsUpdated + radarrResults.itemsUpdated
      const totalTagsRemoved =
        sonarrResults.tagsRemoved + radarrResults.tagsRemoved
      const totalTagsDeleted =
        sonarrResults.tagsDeleted + radarrResults.tagsDeleted

      this.log.info('User tag removal complete', {
        itemsUpdated: totalItemsUpdated,
        tagsRemoved: totalTagsRemoved,
        tagsDeleted: totalTagsDeleted,
        sonarr: sonarrResults,
        radarr: radarrResults,
      })

      return {
        sonarr: sonarrResults,
        radarr: radarrResults,
      }
    } catch (error) {
      this.log.error({ error }, 'Error in complete tag removal:')
      throw error
    }
  }

  /**
   * Get the tag label for a user
   *
   * @param user User object containing name
   * @returns Formatted tag label in format "{prefix}:{name}"
   */
  private getUserTagLabel(user: { name: string }): string {
    // Sanitize the username first
    const sanitizedName = user.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-:.]/g, '_') // keep safe charset

    // Validate the tag prefix meets our requirements (consistent with API validation)
    if (!/^[a-zA-Z0-9_\-:.]+$/.test(this.tagPrefix)) {
      this.log.warn(
        `Invalid tag prefix format: "${this.tagPrefix}". Using default "pulsarr:user" instead.`,
      )
      return `pulsarr:user:${sanitizedName}`
    }

    return `${this.tagPrefix}:${sanitizedName}`
  }

  /**
   * Check if a tag belongs to our application's user tagging system
   *
   * @param tagLabel The tag label to check
   * @returns True if this is an application user tag
   */
  private isAppUserTag(tagLabel: string): boolean {
    return tagLabel.toLowerCase().startsWith(`${this.tagPrefix.toLowerCase()}:`)
  }

  /**
   * Ensures the special "removed" tag exists in the given service
   * Creates it if it doesn't exist yet
   *
   * @param service - The Sonarr/Radarr service to create the tag in
   * @param tagLabelMap - Map of tag labels to IDs
   * @param tagIdMap - Map of tag IDs to labels
   * @param itemName - Name of the item (for logging)
   * @returns ID of the removed tag
   */
  private async ensureRemovedTag(
    service: MediaService,
    tagLabelMap: Map<string, number>,
    tagIdMap: Map<number, string>,
    itemName: string,
  ): Promise<number> {
    try {
      // Get or create the "removed" tag
      const removedTagLabel = this.removedTagPrefix
      const lowerLabel = removedTagLabel.toLowerCase()

      // Check if the tag already exists using direct map lookup
      let removedTagId = tagLabelMap.get(lowerLabel)

      if (!removedTagId) {
        // Create the removed tag if it doesn't exist
        this.log.debug(
          `Creating removed tag "${removedTagLabel}" for ${itemName}`,
        )
        const newTag = await service.createTag(removedTagLabel)
        removedTagId = newTag.id
        tagLabelMap.set(lowerLabel, removedTagId)
        tagIdMap.set(removedTagId, lowerLabel)
      }

      return removedTagId
    } catch (error) {
      this.log.error({ error }, `Error creating removed tag for ${itemName}:`)
      throw error
    }
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false

    const setA = new Set(a)
    const setB = new Set(b)

    // If sets have different sizes, there are duplicates
    // and arrays can't be identical
    if (setA.size !== setB.size) return false

    // Check if every element in setA exists in setB
    return [...setA].every((item) => setB.has(item))
  }

  /**
   * Clean up orphaned user tags in Sonarr instances
   * This is a helper method for cleanupOrphanedUserTags to support parallel execution
   *
   * @param sonarrInstances List of Sonarr instances
   * @param validUserTagLabels Set of valid user tag labels
   * @returns Results of cleanup operation
   */
  private async cleanupOrphanedSonarrTags(
    sonarrInstances: Array<{ id: number; name: string }>,
    validUserTagLabels: Set<string>,
  ): Promise<TagCleanupResults> {
    const results: TagCleanupResults = {
      removed: 0,
      skipped: 0,
      failed: 0,
      instances: sonarrInstances.length,
    }
    let _sonarrInstancesProcessed = 0
    const sonarrManager = this.fastify.sonarrManager

    for (const instance of sonarrInstances) {
      try {
        const sonarrService = sonarrManager.getSonarrService(instance.id)
        if (!sonarrService) {
          this.log.warn(
            `Sonarr service for instance ${instance.name} not found, skipping orphaned tag cleanup`,
          )
          _sonarrInstancesProcessed++
          continue
        }

        // Get all tags from this instance
        const tags = await sonarrService.getTags()

        // Find orphaned user tags (those with our prefix but no matching user)
        const orphanedTags = tags.filter(
          (tag) =>
            this.isAppUserTag(tag.label) &&
            !validUserTagLabels.has(tag.label.toLowerCase()),
        )

        if (orphanedTags.length === 0) {
          this.log.debug(
            `No orphaned user tags found in Sonarr instance ${instance.name}`,
          )
          _sonarrInstancesProcessed++
          continue
        }

        this.log.info(
          `Found ${orphanedTags.length} orphaned user tags in Sonarr instance ${instance.name}`,
        )

        // Get all series with their tags in one bulk call
        const allSeriesDetails =
          await sonarrService.getFromSonarr<Array<SonarrSeries>>('series')

        // Orphaned tag IDs for quick lookup
        const orphanedTagIds = new Set(orphanedTags.map((t) => t.id))

        // Collect bulk updates for series that have orphaned tags
        const bulkUpdates: Array<{ seriesId: number; tagIds: number[] }> = []

        for (const seriesDetail of allSeriesDetails) {
          try {
            const existingTags = seriesDetail.tags || []

            // Check if this series has any of the orphaned tags
            const hasOrphanedTags = existingTags.some((tagId) =>
              orphanedTagIds.has(tagId),
            )

            if (!hasOrphanedTags) {
              results.skipped++
              continue
            }

            // Filter out orphaned tags
            const newTags = existingTags.filter(
              (tagId) => !orphanedTagIds.has(tagId),
            )

            // Add to bulk updates
            bulkUpdates.push({
              seriesId: seriesDetail.id,
              tagIds: newTags,
            })

            results.removed++
          } catch (error) {
            this.log.error(
              { error },
              `Error processing series "${seriesDetail.title}" for orphaned tag cleanup:`,
            )
            results.failed++
          }
        }

        // Apply bulk updates with fallback to individual updates
        if (bulkUpdates.length > 0) {
          try {
            await sonarrService.bulkUpdateSeriesTags(bulkUpdates)
            this.log.info(
              `Bulk removed orphaned tags from ${bulkUpdates.length} series in ${instance.name}`,
            )
          } catch (bulkError) {
            this.log.warn(
              `Bulk orphaned tag cleanup failed for ${instance.name}, falling back to individual updates:`,
              bulkError,
            )

            // Fallback to individual updates
            for (const update of bulkUpdates) {
              try {
                await sonarrService.updateSeriesTags(
                  update.seriesId,
                  update.tagIds,
                )
              } catch (individualError) {
                this.log.error(
                  { error: individualError },
                  `Individual orphaned tag cleanup failed for series ID ${update.seriesId}:`,
                )
                results.failed++
                // Don't decrement removed - it was never successfully updated
              }
            }
          }
        }

        this.log.info(
          `Completed orphaned tag cleanup for Sonarr instance ${instance.name}: removed tags from ${results.removed} series`,
        )

        _sonarrInstancesProcessed++
      } catch (instanceError) {
        this.log.error(
          { error: instanceError },
          `Error processing Sonarr instance ${instance.name} for orphaned tag cleanup:`,
        )
        _sonarrInstancesProcessed++
      }
    }

    return results
  }

  /**
   * Clean up orphaned user tags in Radarr instances
   * This is a helper method for cleanupOrphanedUserTags to support parallel execution
   *
   * @param radarrInstances List of Radarr instances
   * @param validUserTagLabels Set of valid user tag labels
   * @returns Results of cleanup operation
   */
  private async cleanupOrphanedRadarrTags(
    radarrInstances: Array<{ id: number; name: string }>,
    validUserTagLabels: Set<string>,
  ): Promise<TagCleanupResults> {
    const results: TagCleanupResults = {
      removed: 0,
      skipped: 0,
      failed: 0,
      instances: radarrInstances.length,
    }
    let _radarrInstancesProcessed = 0
    const radarrManager = this.fastify.radarrManager

    for (const instance of radarrInstances) {
      try {
        const radarrService = radarrManager.getRadarrService(instance.id)
        if (!radarrService) {
          this.log.warn(
            `Radarr service for instance ${instance.name} not found, skipping orphaned tag cleanup`,
          )
          _radarrInstancesProcessed++
          continue
        }

        // Get all tags from this instance
        const tags = await radarrService.getTags()

        // Find orphaned user tags (those with our prefix but no matching user)
        const orphanedTags = tags.filter(
          (tag) =>
            this.isAppUserTag(tag.label) &&
            !validUserTagLabels.has(tag.label.toLowerCase()),
        )

        if (orphanedTags.length === 0) {
          this.log.debug(
            `No orphaned user tags found in Radarr instance ${instance.name}`,
          )
          _radarrInstancesProcessed++
          continue
        }

        this.log.info(
          `Found ${orphanedTags.length} orphaned user tags in Radarr instance ${instance.name}`,
        )

        // Get all movies with their tags in one bulk call
        const allMovieDetails =
          await radarrService.getFromRadarr<Array<RadarrMovie>>('movie')

        // Orphaned tag IDs for quick lookup
        const orphanedTagIds = new Set(orphanedTags.map((t) => t.id))

        // Collect bulk updates for movies that have orphaned tags
        const bulkUpdates: Array<{ movieId: number; tagIds: number[] }> = []

        for (const movieDetail of allMovieDetails) {
          try {
            const existingTags = movieDetail.tags || []

            // Check if this movie has any of the orphaned tags
            const hasOrphanedTags = existingTags.some((tagId) =>
              orphanedTagIds.has(tagId),
            )

            if (!hasOrphanedTags) {
              results.skipped++
              continue
            }

            // Filter out orphaned tags
            const newTags = existingTags.filter(
              (tagId) => !orphanedTagIds.has(tagId),
            )

            // Add to bulk updates
            bulkUpdates.push({
              movieId: movieDetail.id,
              tagIds: newTags,
            })

            results.removed++
          } catch (error) {
            this.log.error(
              { error },
              `Error processing movie "${movieDetail.title}" for orphaned tag cleanup:`,
            )
            results.failed++
          }
        }

        // Apply bulk updates with fallback to individual updates
        if (bulkUpdates.length > 0) {
          try {
            await radarrService.bulkUpdateMovieTags(bulkUpdates)
            this.log.info(
              `Bulk removed orphaned tags from ${bulkUpdates.length} movies in ${instance.name}`,
            )
          } catch (bulkError) {
            this.log.warn(
              `Bulk orphaned tag cleanup failed for ${instance.name}, falling back to individual updates:`,
              bulkError,
            )

            // Fallback to individual updates
            for (const update of bulkUpdates) {
              try {
                await radarrService.updateMovieTags(
                  update.movieId,
                  update.tagIds,
                )
              } catch (individualError) {
                this.log.error(
                  { error: individualError },
                  `Individual orphaned tag cleanup failed for movie ID ${update.movieId}:`,
                )
                results.failed++
                // Don't decrement removed - it was never successfully updated
              }
            }
          }
        }

        this.log.info(
          `Completed orphaned tag cleanup for Radarr instance ${instance.name}: removed tags from ${results.removed} movies`,
        )

        _radarrInstancesProcessed++
      } catch (instanceError) {
        this.log.error(
          { error: instanceError },
          `Error processing Radarr instance ${instance.name} for orphaned tag cleanup:`,
        )
        _radarrInstancesProcessed++
      }
    }

    return results
  }
}
