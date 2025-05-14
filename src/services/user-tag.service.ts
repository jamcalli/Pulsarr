import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  hasMatchingGuids,
  extractRadarrId,
  extractSonarrId,
} from '@utils/guid-handler.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { RadarrItem } from '@root/types/radarr.types.js'
import type { ProgressEvent } from '@root/types/progress.types.js'

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
 * Type for a user object
 */
interface User {
  id: number
  name: string
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
   * Check if progress reporting is available and has active connections
   */
  private hasActiveProgressConnections(): boolean {
    return this.fastify?.progress?.hasActiveConnections() || false
  }

  /**
   * Emit a progress event if progress reporting is available
   */
  private emitProgress(progressData: ProgressEvent): void {
    if (this.fastify?.progress) {
      this.fastify.progress.emit(progressData)
    }
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
          `Failed to create tag "${tagInfo.label}" for user ${tagInfo.user.name}:`,
          error,
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
      // Get all users
      const users = await this.fastify.db.getAllUsers()

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
            `Error processing tags for Sonarr instance ${instance.name}:`,
            instanceError,
          )
        }
      }

      return results
    } catch (error) {
      this.log.error('Error creating Sonarr user tags:', error)
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
      // Get all users
      const users = await this.fastify.db.getAllUsers()

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
            `Error processing tags for Radarr instance ${instance.name}:`,
            instanceError,
          )
        }
      }

      return results
    } catch (error) {
      this.log.error('Error creating Radarr user tags:', error)
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
      // Get all users for tag lookup
      const users = await this.fastify.db.getAllUsers()

      // Create a map of user IDs to user objects
      const userMap = new Map(users.map((user) => [user.id, user]))

      // Process each Sonarr instance
      const sonarrManager = this.fastify.sonarrManager
      const sonarrInstances = await sonarrManager.getAllInstances()

      for (const instance of sonarrInstances) {
        try {
          const sonarrService = sonarrManager.getSonarrService(instance.id)

          if (!sonarrService) {
            this.log.warn(
              `Sonarr service for instance ${instance.name} not found, skipping tagging`,
            )
            continue
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

          // Log beginning of processing at DEBUG level
          this.log.debug(
            `Processing ${instanceSeries.length} series in Sonarr instance ${instance.name} for user tagging`,
          )

          // Process series in batches
          const BATCH_SIZE = 5 // Number of items to process in parallel
          const instanceResults = { tagged: 0, skipped: 0, failed: 0 }

          // Group the series for batch processing
          for (let i = 0; i < instanceSeries.length; i += BATCH_SIZE) {
            const batch = instanceSeries.slice(i, i + BATCH_SIZE)
            const batchPromises = batch.map(async (show) => {
              try {
                // Find users who have this show in their watchlist
                const showUsers = new Set<number>()

                for (const item of watchlistItems) {
                  if (hasMatchingGuids(show.guids, item.guids)) {
                    showUsers.add(item.user_id)
                  }
                }

                // Skip processing if no users have this in watchlist and we're in 'keep' mode
                if (showUsers.size === 0 && this.removedTagMode === 'keep') {
                  return { tagged: false, skipped: true, failed: false }
                }

                // Extract Sonarr ID
                const sonarrId = this.extractSonarrId(show.guids)
                if (sonarrId === 0) {
                  this.log.debug(
                    `Could not extract Sonarr ID from show "${show.title}", skipping tagging`,
                  )
                  return { tagged: false, skipped: true, failed: false }
                }

                // Get full series details to get current tags
                const seriesDetails = await sonarrService.getFromSonarr<
                  SonarrItem & { tags: number[] }
                >(`series/${sonarrId}`)

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

                // Handle tags based on configuration mode
                let newTags: number[]

                if (this.removedTagMode === 'keep') {
                  // Simply add any missing user tags, don't remove any
                  newTags = [...new Set([...existingTags, ...userTagIds])]
                } else if (this.removedTagMode === 'special-tag') {
                  // Find non-user tags to preserve
                  const nonUserTagIds = existingTags.filter((tagId) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  })

                  // Find user tags that are being removed
                  const removedUserTagIds = existingTags.filter((tagId) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return (
                      tagLabel &&
                      this.isAppUserTag(tagLabel) &&
                      !userTagIds.includes(tagId)
                    )
                  })

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
                        'Failed to create special removed tag. Cannot proceed with special-tag mode:',
                        tagError,
                      )
                      // Propagate the error - don't silently fall back to different behavior
                      throw tagError
                    }
                  } else {
                    // No tags being removed, just use current tags
                    newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
                  }
                } else {
                  // Default 'remove' mode
                  // Filter out any existing user tags and add current ones
                  const nonUserTagIds = existingTags.filter((tagId) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  })

                  // Combine non-user tags with new user tags
                  newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
                }

                // Only update if tags have changed
                if (!this.arraysEqual(existingTags, newTags)) {
                  await sonarrService.updateSeriesTags(sonarrId, newTags)
                  this.log.debug(
                    `Tagged show "${show.title}" with ${userTagIds.length} user tags`,
                  )
                  return { tagged: true, skipped: false, failed: false }
                }
                return { tagged: false, skipped: true, failed: false }
              } catch (showError) {
                this.log.error(`Error tagging show "${show.title}":`, showError)
                return { tagged: false, skipped: false, failed: true }
              }
            })

            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises)

            // Update counts
            for (const result of batchResults) {
              if (result.tagged) {
                instanceResults.tagged++
                results.tagged++
              }
              if (result.skipped) {
                instanceResults.skipped++
                results.skipped++
              }
              if (result.failed) {
                instanceResults.failed++
                results.failed++
              }
            }
          }

          // Only log once at the end for this instance
          this.log.debug(
            `Completed tagging for Sonarr instance ${instance.name}: Processed ${instanceSeries.length} series (tagged: ${instanceResults.tagged}, skipped: ${instanceResults.skipped}, failed: ${instanceResults.failed})`,
          )
        } catch (instanceError) {
          this.log.error(
            `Error processing Sonarr instance ${instance.name} for tagging:`,
            instanceError,
          )
        }
      }

      return results
    } catch (error) {
      this.log.error('Error tagging Sonarr content:', error)
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
      // Get all users for tag lookup
      const users = await this.fastify.db.getAllUsers()

      // Create a map of user IDs to user objects
      const userMap = new Map(users.map((user) => [user.id, user]))

      // Process each Radarr instance
      const radarrManager = this.fastify.radarrManager
      const radarrInstances = await radarrManager.getAllInstances()

      for (const instance of radarrInstances) {
        try {
          const radarrService = radarrManager.getRadarrService(instance.id)

          if (!radarrService) {
            this.log.warn(
              `Radarr service for instance ${instance.name} not found, skipping tagging`,
            )
            continue
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

          // Log beginning of processing at DEBUG level
          this.log.debug(
            `Processing ${instanceMovies.length} movies in Radarr instance ${instance.name} for user tagging`,
          )

          // Process movies in batches
          const BATCH_SIZE = 5 // Number of items to process in parallel
          const instanceResults = { tagged: 0, skipped: 0, failed: 0 }

          // Group the movies for batch processing
          for (let i = 0; i < instanceMovies.length; i += BATCH_SIZE) {
            const batch = instanceMovies.slice(i, i + BATCH_SIZE)
            const batchPromises = batch.map(async (movie) => {
              try {
                // Find users who have this movie in their watchlist
                const movieUsers = new Set<number>()

                for (const item of watchlistItems) {
                  if (hasMatchingGuids(movie.guids, item.guids)) {
                    movieUsers.add(item.user_id)
                  }
                }

                // Skip processing if no users have this in watchlist and we're in 'keep' mode
                if (movieUsers.size === 0 && this.removedTagMode === 'keep') {
                  return { tagged: false, skipped: true, failed: false }
                }

                // Extract Radarr ID
                const radarrId = this.extractRadarrId(movie.guids)
                if (radarrId === 0) {
                  this.log.debug(
                    `Could not extract Radarr ID from movie "${movie.title}", skipping tagging`,
                  )
                  return { tagged: false, skipped: true, failed: false }
                }

                // Get full movie details to get current tags
                const movieDetails = await radarrService.getFromRadarr<
                  RadarrItem & { tags: number[] }
                >(`movie/${radarrId}`)

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

                // Handle tags based on configuration mode
                let newTags: number[]

                if (this.removedTagMode === 'keep') {
                  // Simply add any missing user tags, don't remove any
                  newTags = [...new Set([...existingTags, ...userTagIds])]
                } else if (this.removedTagMode === 'special-tag') {
                  // Find non-user tags to preserve
                  const nonUserTagIds = existingTags.filter((tagId) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  })

                  // Find user tags that are being removed
                  const removedUserTagIds = existingTags.filter((tagId) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return (
                      tagLabel &&
                      this.isAppUserTag(tagLabel) &&
                      !userTagIds.includes(tagId)
                    )
                  })

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
                        'Failed to create special removed tag. Cannot proceed with special-tag mode:',
                        tagError,
                      )
                      // Propagate the error - don't silently fall back to different behavior
                      throw tagError
                    }
                  } else {
                    // No tags being removed, just use current tags
                    newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
                  }
                } else {
                  // Default 'remove' mode
                  // Filter out any existing user tags and add current ones
                  const nonUserTagIds = existingTags.filter((tagId) => {
                    const tagLabel = tagIdMap.get(tagId)
                    return !tagLabel || !this.isAppUserTag(tagLabel)
                  })

                  // Combine non-user tags with new user tags
                  newTags = [...new Set([...nonUserTagIds, ...userTagIds])]
                }

                // Only update if tags have changed
                if (!this.arraysEqual(existingTags, newTags)) {
                  await radarrService.updateMovieTags(radarrId, newTags)
                  this.log.debug(
                    `Tagged movie "${movie.title}" with ${userTagIds.length} user tags`,
                  )
                  return { tagged: true, skipped: false, failed: false }
                }
                return { tagged: false, skipped: true, failed: false }
              } catch (movieError) {
                this.log.error(
                  `Error tagging movie "${movie.title}":`,
                  movieError,
                )
                return { tagged: false, skipped: false, failed: true }
              }
            })

            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises)

            // Update counts
            for (const result of batchResults) {
              if (result.tagged) {
                instanceResults.tagged++
                results.tagged++
              }
              if (result.skipped) {
                instanceResults.skipped++
                results.skipped++
              }
              if (result.failed) {
                instanceResults.failed++
                results.failed++
              }
            }
          }

          // Only log once at the end for this instance
          this.log.debug(
            `Completed tagging for Radarr instance ${instance.name}: Processed ${instanceMovies.length} movies (tagged: ${instanceResults.tagged}, skipped: ${instanceResults.skipped}, failed: ${instanceResults.failed})`,
          )
        } catch (instanceError) {
          this.log.error(
            `Error processing Radarr instance ${instance.name} for tagging:`,
            instanceError,
          )
        }
      }

      return results
    } catch (error) {
      this.log.error('Error tagging Radarr content:', error)
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
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
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
      let processedSeries = 0

      // Apply tags to series batches
      const results: TaggingResults = { tagged: 0, skipped: 0, failed: 0 }
      const BATCH_SIZE = 10

      // Process all series in batches with progress reporting
      for (let i = 0; i < existingSeries.length; i += BATCH_SIZE) {
        const batch = existingSeries.slice(i, i + BATCH_SIZE)

        // Tag the current batch
        const batchResults = await this.tagSonarrContentWithData(
          batch,
          watchlistItems,
        )

        // Update counts
        results.tagged += batchResults.tagged
        results.skipped += batchResults.skipped
        results.failed += batchResults.failed

        // Update progress
        processedSeries += batch.length

        if (emitProgress && totalSeries > 0) {
          const progress = 5 + Math.floor((processedSeries / totalSeries) * 90)
          this.emitProgress({
            operationId,
            type: 'sonarr-tagging',
            phase: 'tagging-series',
            progress: progress,
            message: `Tagged ${processedSeries}/${totalSeries} series`,
          })
        }
      }

      // Final logging summary - keep this at INFO level
      this.log.info(
        `Completed tagging for Sonarr instance. Sonarr: Processed ${totalSeries} series (tagged: ${results.tagged}, skipped: ${results.skipped}, failed: ${results.failed})`,
      )

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'complete',
          progress: 100,
          message: `Completed Sonarr tag sync: tagged ${results.tagged} series, skipped ${results.skipped}, failed ${results.failed}`,
        })
      }

      return results
    } catch (error) {
      this.log.error('Error syncing Sonarr tags:', error)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'error',
          progress: 100,
          message: `Error syncing Sonarr tags: ${error}`,
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
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
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
      let processedMovies = 0

      // Apply tags to movie batches
      const results: TaggingResults = { tagged: 0, skipped: 0, failed: 0 }
      const BATCH_SIZE = 10

      // Process all movies in batches with progress reporting
      for (let i = 0; i < existingMovies.length; i += BATCH_SIZE) {
        const batch = existingMovies.slice(i, i + BATCH_SIZE)

        // Tag the current batch
        const batchResults = await this.tagRadarrContentWithData(
          batch,
          watchlistItems,
        )

        // Update counts
        results.tagged += batchResults.tagged
        results.skipped += batchResults.skipped
        results.failed += batchResults.failed

        // Update progress
        processedMovies += batch.length

        if (emitProgress && totalMovies > 0) {
          const progress = 5 + Math.floor((processedMovies / totalMovies) * 90)
          this.emitProgress({
            operationId,
            type: 'radarr-tagging',
            phase: 'tagging-movies',
            progress: progress,
            message: `Tagged ${processedMovies}/${totalMovies} movies`,
          })
        }
      }

      // Final logging summary - keep this at INFO level
      this.log.info(
        `Completed tagging for Radarr instance. Radarr: Processed ${totalMovies} movies (tagged: ${results.tagged}, skipped: ${results.skipped}, failed: ${results.failed})`,
      )

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'complete',
          progress: 100,
          message: `Completed Radarr tag sync: tagged ${results.tagged} movies, skipped ${results.skipped}, failed ${results.failed}`,
        })
      }

      return results
    } catch (error) {
      this.log.error('Error syncing Radarr tags:', error)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'error',
          progress: 100,
          message: `Error syncing Radarr tags: ${error}`,
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
      let orphanedCleanup: OrphanedTagCleanupResults | undefined = undefined

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
          this.log.error('Error during orphaned tag cleanup:', cleanupError)
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
      this.log.error('Error in tag synchronization:', error)
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
      // Get all current users
      const users = await this.fastify.db.getAllUsers()
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
      this.log.error('Error cleaning up orphaned user tags:', error)
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
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
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
              `Error collecting data from instance ${instance.name}:`,
              error,
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

      // Process each instance
      for (const instanceData of validInstancesData) {
        const { instance, service, userTags, series, userTagIds } = instanceData

        this.log.info(
          `Processing ${series.length} series in Sonarr instance ${instance.name} for tag removal`,
        )

        // Process in batches
        const BATCH_SIZE = 10
        let instanceProcessedSeries = 0

        for (let i = 0; i < series.length; i += BATCH_SIZE) {
          const batch = series.slice(i, i + BATCH_SIZE)

          const batchPromises = batch.map(async (item: SonarrItem) => {
            try {
              results.itemsProcessed++

              // Extract Sonarr ID
              const sonarrId = this.extractSonarrId(item.guids)
              if (sonarrId === 0) {
                return { updated: false, tagsRemoved: 0, failed: false }
              }

              // Get series details with tags
              const seriesDetails = await service.getFromSonarr<
                SonarrItem & { tags: number[] }
              >(`series/${sonarrId}`)
              const existingTags = seriesDetails.tags || []

              // Check if this series has any of our user tags
              const hasUserTags = existingTags.some((tagId: number) =>
                userTagIds.includes(tagId),
              )

              if (!hasUserTags) {
                return { updated: false, tagsRemoved: 0, failed: false }
              }

              // Filter out user tags
              const newTags = existingTags.filter(
                (tagId: number) => !userTagIds.includes(tagId),
              )

              const tagsRemoved = existingTags.length - newTags.length

              // Update the series tags
              await service.updateSeriesTags(sonarrId, newTags)

              return { updated: true, tagsRemoved, failed: false }
            } catch (error) {
              this.log.error(
                `Error removing tags from series "${item.title}":`,
                error,
              )
              return { updated: false, tagsRemoved: 0, failed: true }
            }
          })

          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises)

          // Update counts
          for (const result of batchResults) {
            if (result.updated) results.itemsUpdated++
            if (result.tagsRemoved) results.tagsRemoved += result.tagsRemoved
            if (result.failed) results.failed++
          }

          // Update progress
          instanceProcessedSeries += batch.length
          totalProcessedSeries += batch.length

          if (emitProgress && totalSeries > 0) {
            const progress =
              5 + Math.floor((totalProcessedSeries / totalSeries) * 85)
            this.emitProgress({
              operationId,
              type: 'sonarr-tag-removal',
              phase: 'processing-series',
              progress: progress,
              message: `Processed ${instanceProcessedSeries}/${series.length} series in ${instance.name} (${totalProcessedSeries}/${totalSeries} total)`,
            })
          }
        }

        // Delete tag definitions if requested
        if (deleteTagDefinitions && userTags.length > 0) {
          if (emitProgress) {
            this.emitProgress({
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
                `Error deleting tag ID ${tag.id} from Sonarr:`,
                error,
              )
            }
          }
        }
      }

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tag-removal',
          phase: 'complete',
          progress: 100,
          message: `Completed Sonarr tag removal: updated ${results.itemsUpdated} series, removed ${results.tagsRemoved} tags, deleted ${results.tagsDeleted} tag definitions`,
        })
      }

      return results
    } catch (error) {
      this.log.error('Error removing Sonarr user tags:', error)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tag-removal',
          phase: 'error',
          progress: 100,
          message: `Error removing Sonarr user tags: ${error}`,
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
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
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
              `Error collecting data from instance ${instance.name}:`,
              error,
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

      // Process each instance
      for (const instanceData of validInstancesData) {
        const { instance, service, userTags, movies, userTagIds } = instanceData

        this.log.info(
          `Processing ${movies.length} movies in Radarr instance ${instance.name} for tag removal`,
        )

        // Process in batches
        const BATCH_SIZE = 10
        let instanceProcessedMovies = 0

        for (let i = 0; i < movies.length; i += BATCH_SIZE) {
          const batch = movies.slice(i, i + BATCH_SIZE)

          const batchPromises = batch.map(async (item: RadarrItem) => {
            try {
              results.itemsProcessed++

              // Extract Radarr ID
              const radarrId = this.extractRadarrId(item.guids)
              if (radarrId === 0) {
                return { updated: false, tagsRemoved: 0, failed: false }
              }

              // Get movie details with tags
              const movieDetails = await service.getFromRadarr<
                RadarrItem & { tags: number[] }
              >(`movie/${radarrId}`)
              const existingTags = movieDetails.tags || []

              // Check if this movie has any of our user tags
              const hasUserTags = existingTags.some((tagId: number) =>
                userTagIds.includes(tagId),
              )

              if (!hasUserTags) {
                return { updated: false, tagsRemoved: 0, failed: false }
              }

              // Filter out user tags
              const newTags = existingTags.filter(
                (tagId: number) => !userTagIds.includes(tagId),
              )

              const tagsRemoved = existingTags.length - newTags.length

              // Update the movie tags
              await service.updateMovieTags(radarrId, newTags)

              return { updated: true, tagsRemoved, failed: false }
            } catch (error) {
              this.log.error(
                `Error removing tags from movie "${item.title}":`,
                error,
              )
              return { updated: false, tagsRemoved: 0, failed: true }
            }
          })

          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises)

          // Update counts
          for (const result of batchResults) {
            if (result.updated) results.itemsUpdated++
            if (result.tagsRemoved) results.tagsRemoved += result.tagsRemoved
            if (result.failed) results.failed++
          }

          // Update progress
          instanceProcessedMovies += batch.length
          totalProcessedMovies += batch.length

          if (emitProgress && totalMovies > 0) {
            const progress =
              5 + Math.floor((totalProcessedMovies / totalMovies) * 85)
            this.emitProgress({
              operationId,
              type: 'radarr-tag-removal',
              phase: 'processing-movies',
              progress: progress,
              message: `Processed ${instanceProcessedMovies}/${movies.length} movies in ${instance.name} (${totalProcessedMovies}/${totalMovies} total)`,
            })
          }
        }

        // Delete tag definitions if requested
        if (deleteTagDefinitions && userTags.length > 0) {
          if (emitProgress) {
            this.emitProgress({
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
                `Error deleting tag ID ${tag.id} from Radarr:`,
                error,
              )
            }
          }
        }
      }

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tag-removal',
          phase: 'complete',
          progress: 100,
          message: `Completed Radarr tag removal: updated ${results.itemsUpdated} movies, removed ${results.tagsRemoved} tags, deleted ${results.tagsDeleted} tag definitions`,
        })
      }

      return results
    } catch (error) {
      this.log.error('Error removing Radarr user tags:', error)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tag-removal',
          phase: 'error',
          progress: 100,
          message: `Error removing Radarr user tags: ${error}`,
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
      this.log.error('Error in complete tag removal:', error)
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
    return tagLabel.toLowerCase().startsWith(`${this.tagPrefix}:`)
  }

  /**
   * Extract Sonarr ID from GUIDs
   */
  private extractSonarrId(guids: string[] | undefined): number {
    if (!guids) return 0

    for (const guid of guids) {
      if (guid.startsWith('sonarr:')) {
        const id = Number.parseInt(guid.replace('sonarr:', ''), 10)
        return Number.isNaN(id) ? 0 : id
      }
    }

    return 0
  }

  /**
   * Extract Radarr ID from GUIDs
   */
  private extractRadarrId(guids: string[] | undefined): number {
    if (!guids) return 0

    for (const guid of guids) {
      if (guid.startsWith('radarr:')) {
        const id = Number.parseInt(guid.replace('radarr:', ''), 10)
        return Number.isNaN(id) ? 0 : id
      }
    }

    return 0
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
      this.log.error(`Error creating removed tag for ${itemName}:`, error)
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
    let sonarrInstancesProcessed = 0
    const sonarrManager = this.fastify.sonarrManager

    for (const instance of sonarrInstances) {
      try {
        const sonarrService = sonarrManager.getSonarrService(instance.id)
        if (!sonarrService) {
          this.log.warn(
            `Sonarr service for instance ${instance.name} not found, skipping orphaned tag cleanup`,
          )
          sonarrInstancesProcessed++
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
          sonarrInstancesProcessed++
          continue
        }

        this.log.info(
          `Found ${orphanedTags.length} orphaned user tags in Sonarr instance ${instance.name}`,
        )

        // Get all series to check for these tags
        const allSeries = await sonarrService.fetchSeries(true)

        // Orphaned tag IDs for quick lookup
        const orphanedTagIds = new Set(orphanedTags.map((t) => t.id))

        // Process series in batches
        const BATCH_SIZE = 10
        let processedCount = 0

        for (let i = 0; i < Array.from(allSeries).length; i += BATCH_SIZE) {
          const batch = Array.from(allSeries).slice(i, i + BATCH_SIZE)
          const batchPromises = batch.map(async (series) => {
            try {
              // Extract Sonarr ID
              const sonarrId = this.extractSonarrId(series.guids)
              if (sonarrId === 0) {
                return { removed: false, skipped: true, failed: false }
              }

              // Get series details with tags
              const seriesDetails = await sonarrService.getFromSonarr<
                SonarrItem & { tags: number[] }
              >(`series/${sonarrId}`)
              const existingTags = seriesDetails.tags || []

              // Check if this series has any of the orphaned tags
              const hasOrphanedTags = existingTags.some((tagId) =>
                orphanedTagIds.has(tagId),
              )

              if (!hasOrphanedTags) {
                return { removed: false, skipped: true, failed: false }
              }

              // Filter out orphaned tags
              const newTags = existingTags.filter(
                (tagId) => !orphanedTagIds.has(tagId),
              )

              // Update the series tags
              await sonarrService.updateSeriesTags(sonarrId, newTags)
              this.log.debug(
                `Removed orphaned tags from series "${series.title}"`,
              )
              return { removed: true, skipped: false, failed: false }
            } catch (error) {
              this.log.error(
                `Error cleaning up orphaned tags for series "${series.title}":`,
                error,
              )
              return { removed: false, skipped: false, failed: true }
            }
          })

          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises)

          // Update counts
          for (const result of batchResults) {
            if (result.removed) results.removed++
            if (result.skipped) results.skipped++
            if (result.failed) results.failed++
          }

          processedCount += batch.length
        }

        this.log.info(
          `Completed orphaned tag cleanup for Sonarr instance ${instance.name}: removed tags from ${results.removed} series`,
        )

        sonarrInstancesProcessed++
      } catch (instanceError) {
        this.log.error(
          `Error processing Sonarr instance ${instance.name} for orphaned tag cleanup:`,
          instanceError,
        )
        sonarrInstancesProcessed++
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
    let radarrInstancesProcessed = 0
    const radarrManager = this.fastify.radarrManager

    for (const instance of radarrInstances) {
      try {
        const radarrService = radarrManager.getRadarrService(instance.id)
        if (!radarrService) {
          this.log.warn(
            `Radarr service for instance ${instance.name} not found, skipping orphaned tag cleanup`,
          )
          radarrInstancesProcessed++
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
          radarrInstancesProcessed++
          continue
        }

        this.log.info(
          `Found ${orphanedTags.length} orphaned user tags in Radarr instance ${instance.name}`,
        )

        // Get all movies to check for these tags
        const movies = await radarrService.fetchMovies(true)

        // Orphaned tag IDs for quick lookup
        const orphanedTagIds = new Set(orphanedTags.map((t) => t.id))

        // Process movies in batches
        const BATCH_SIZE = 10
        let processedCount = 0

        for (let i = 0; i < Array.from(movies).length; i += BATCH_SIZE) {
          const batch = Array.from(movies).slice(i, i + BATCH_SIZE)
          const batchPromises = batch.map(async (movie) => {
            try {
              // Extract Radarr ID
              const radarrId = this.extractRadarrId(movie.guids)
              if (radarrId === 0) {
                return { removed: false, skipped: true, failed: false }
              }

              // Get movie details with tags
              const movieDetails = await radarrService.getFromRadarr<
                RadarrItem & { tags: number[] }
              >(`movie/${radarrId}`)
              const existingTags = movieDetails.tags || []

              // Check if this movie has any of the orphaned tags
              const hasOrphanedTags = existingTags.some((tagId) =>
                orphanedTagIds.has(tagId),
              )

              if (!hasOrphanedTags) {
                return { removed: false, skipped: true, failed: false }
              }

              // Filter out orphaned tags
              const newTags = existingTags.filter(
                (tagId) => !orphanedTagIds.has(tagId),
              )

              // Update the movie tags
              await radarrService.updateMovieTags(radarrId, newTags)
              this.log.debug(
                `Removed orphaned tags from movie "${movie.title}"`,
              )
              return { removed: true, skipped: false, failed: false }
            } catch (error) {
              this.log.error(
                `Error cleaning up orphaned tags for movie "${movie.title}":`,
                error,
              )
              return { removed: false, skipped: false, failed: true }
            }
          })

          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises)

          // Update counts
          for (const result of batchResults) {
            if (result.removed) results.removed++
            if (result.skipped) results.skipped++
            if (result.failed) results.failed++
          }

          processedCount += batch.length
        }

        this.log.info(
          `Completed orphaned tag cleanup for Radarr instance ${instance.name}: removed tags from ${results.removed} movies`,
        )

        radarrInstancesProcessed++
      } catch (instanceError) {
        this.log.error(
          `Error processing Radarr instance ${instance.name} for orphaned tag cleanup:`,
          instanceError,
        )
        radarrInstancesProcessed++
      }
    }

    return results
  }
}
