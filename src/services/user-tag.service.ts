import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { hasMatchingGuids } from '@utils/guid-handler.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { RadarrItem } from '@root/types/radarr.types.js'

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
   * Get config value for persisting historical tags
   */
  private get persistHistoricalTags(): boolean {
    return this.fastify.config.persistHistoricalTags
  }

  /**
   * Get config value for tag prefix
   */
  private get tagPrefix(): string {
    return this.fastify.config.tagPrefix || 'pulsarr:user'
  }

  /**
   * Fetch all existing tags and create any missing ones for all users
   * This ensures we only attempt to create each tag once
   *
   * @param service - The Sonarr/Radarr service with getTags and createTag methods
   * @param users - Array of users
   * @returns Maps of tag labels to IDs and IDs to labels, plus count of failed creations
   */
  private async ensureUserTags(
    service: MediaService,
    users: User[],
  ): Promise<{
    tagLabelMap: Map<string, number>
    tagIdMap: Map<number, string>
    failedCount: number
  }> {
    // Get ALL existing tags first
    const existingTags = await service.getTags()

    // Create maps for labels and IDs
    const tagLabelMap = new Map<string, number>()
    const tagIdMap = new Map<number, string>()
    let failedCount = 0

    for (const tag of existingTags) {
      tagLabelMap.set(tag.label.toLowerCase(), tag.id)
      tagIdMap.set(tag.id, tag.label.toLowerCase())
    }

    // Determine which user tags need to be created
    const tagsToCreate: Array<{ user: User; label: string }> = []

    for (const user of users) {
      const tagLabel = this.getUserTagLabel(user)

      if (!tagLabelMap.has(tagLabel)) {
        tagsToCreate.push({ user, label: tagLabel })
      }
    }

    // Log summary of what we're about to do
    if (tagsToCreate.length > 0) {
      this.log.info(`Need to create ${tagsToCreate.length} missing user tags`)
    } else {
      this.log.info(
        `All user tags already exist (${existingTags.length} total tags)`,
      )
    }

    // Create missing tags one at a time
    for (const tagInfo of tagsToCreate) {
      try {
        const newTag = await service.createTag(tagInfo.label)
        tagLabelMap.set(tagInfo.label, newTag.id)
        tagIdMap.set(newTag.id, tagInfo.label)
        this.log.info(
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

    return { tagLabelMap, tagIdMap, failedCount }
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
          const { tagLabelMap, failedCount } = await this.ensureUserTags(
            sonarrService,
            users,
          )

          // Calculate skipped count based on existing tags that match user tags
          let skippedCount = 0
          for (const user of users) {
            const tagLabel = this.getUserTagLabel(user)
            if (tagLabelMap.has(tagLabel)) {
              skippedCount++
            }
          }
          results.skipped += skippedCount
          results.failed += failedCount

          // Count only successfully created tags (handling failed creations correctly)
          const createdNow = users.length - skippedCount - failedCount
          results.created += Math.max(createdNow, 0)

          this.log.info(
            `Processed user tags for Sonarr instance ${instance.name}: created: ${createdNow}, skipped: ${skippedCount}, failed: ${failedCount}`,
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
          const { tagLabelMap, failedCount } = await this.ensureUserTags(
            radarrService,
            users,
          )

          // Calculate skipped count based on existing tags that match user tags
          let skippedCount = 0
          for (const user of users) {
            const tagLabel = this.getUserTagLabel(user)
            if (tagLabelMap.has(tagLabel)) {
              skippedCount++
            }
          }
          results.skipped += skippedCount
          results.failed += failedCount

          // Count only successfully created tags (handling failed creations correctly)
          const createdNow = users.length - skippedCount - failedCount
          results.created += Math.max(createdNow, 0)

          this.log.info(
            `Processed user tags for Radarr instance ${instance.name}: created: ${createdNow}, skipped: ${skippedCount}, failed: ${failedCount}`,
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
   * Tag Sonarr content using pre-fetched data
   * This is the integrated mode for use with the StatusService
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

          this.log.info(
            `Processing ${instanceSeries.length} series in Sonarr instance ${instance.name} for user tagging`,
          )

          // Process each series
          for (const show of instanceSeries) {
            try {
              // Find users who have this show in their watchlist
              const showUsers = new Set<number>()

              for (const item of watchlistItems) {
                if (hasMatchingGuids(show.guids, item.guids)) {
                  showUsers.add(item.user_id)
                }
              }

              // Skip processing if no users have this in watchlist and we're not in cleanup mode
              if (showUsers.size === 0 && this.persistHistoricalTags) {
                results.skipped++
                continue
              }

              // Extract Sonarr ID
              const sonarrId = this.extractSonarrId(show.guids)
              if (sonarrId === 0) {
                this.log.warn(
                  `Could not extract Sonarr ID from show "${show.title}", skipping tagging`,
                )
                results.skipped++
                continue
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
                  const tagId = tagLabelMap.get(tagLabel)

                  if (tagId) {
                    userTagIds.push(tagId)
                  }
                }
              }

              // Get existing tags and prepare new tag set
              const existingTags = seriesDetails.tags || []

              // If we want to preserve historical tags, we only add new ones
              // but don't remove existing user tags
              let newTags: number[]

              if (this.persistHistoricalTags) {
                // Simply add any missing user tags
                newTags = [...new Set([...existingTags, ...userTagIds])]
              } else {
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
                results.tagged++
              } else {
                results.skipped++
              }
            } catch (showError) {
              this.log.error(`Error tagging show "${show.title}":`, showError)
              results.failed++
            }
          }

          this.log.info(
            `Completed tagging for Sonarr instance ${instance.name}`,
            results,
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
   * Tag Radarr content using pre-fetched data
   * This is the integrated mode for use with the StatusService
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

          this.log.info(
            `Processing ${instanceMovies.length} movies in Radarr instance ${instance.name} for user tagging`,
          )

          // Process each movie
          for (const movie of instanceMovies) {
            try {
              // Find users who have this movie in their watchlist
              const movieUsers = new Set<number>()

              for (const item of watchlistItems) {
                if (hasMatchingGuids(movie.guids, item.guids)) {
                  movieUsers.add(item.user_id)
                }
              }

              // Skip processing if no users have this in watchlist and we're not in cleanup mode
              if (movieUsers.size === 0 && this.persistHistoricalTags) {
                results.skipped++
                continue
              }

              // Extract Radarr ID
              const radarrId = this.extractRadarrId(movie.guids)
              if (radarrId === 0) {
                this.log.warn(
                  `Could not extract Radarr ID from movie "${movie.title}", skipping tagging`,
                )
                results.skipped++
                continue
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
                  const tagId = tagLabelMap.get(tagLabel)

                  if (tagId) {
                    userTagIds.push(tagId)
                  }
                }
              }

              // Get existing tags and prepare new tag set
              const existingTags = movieDetails.tags || []

              // If we want to preserve historical tags, we only add new ones
              // but don't remove existing user tags
              let newTags: number[]

              if (this.persistHistoricalTags) {
                // Simply add any missing user tags
                newTags = [...new Set([...existingTags, ...userTagIds])]
              } else {
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
                results.tagged++
              } else {
                results.skipped++
              }
            } catch (movieError) {
              this.log.error(
                `Error tagging movie "${movie.title}":`,
                movieError,
              )
              results.failed++
            }
          }

          this.log.info(
            `Completed tagging for Radarr instance ${instance.name}`,
            results,
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
   * This is the standalone mode for API calls
   *
   * @returns Results of tagging operation
   */
  async syncSonarrTags(): Promise<TaggingResults> {
    if (!this.tagUsersInSonarr) {
      this.log.debug('Sonarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    try {
      // Create user tags first
      await this.createSonarrUserTags()

      // Fetch all shows and series needed for tagging
      const existingSeries =
        await this.fastify.sonarrManager.fetchAllSeries(true)
      const watchlistItems = await this.fastify.db.getAllShowWatchlistItems()

      // Apply tags using the fetched data
      return await this.tagSonarrContentWithData(existingSeries, watchlistItems)
    } catch (error) {
      this.log.error('Error syncing Sonarr tags:', error)
      throw error
    }
  }

  /**
   * Sync all Radarr items with user tags - fetches all data internally
   * This is the standalone mode for API calls
   *
   * @returns Results of tagging operation
   */
  async syncRadarrTags(): Promise<TaggingResults> {
    if (!this.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    try {
      // Create user tags first
      await this.createRadarrUserTags()

      // Fetch all movies and watchlist items needed for tagging
      const existingMovies =
        await this.fastify.radarrManager.fetchAllMovies(true)
      const watchlistItems = await this.fastify.db.getAllMovieWatchlistItems()

      // Apply tags using the fetched data
      return await this.tagRadarrContentWithData(existingMovies, watchlistItems)
    } catch (error) {
      this.log.error('Error syncing Radarr tags:', error)
      throw error
    }
  }

  /**
   * Sync all tags (both Sonarr and Radarr)
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

    const [sonarrResults, radarrResults] = await Promise.all([
      this.syncSonarrTags(),
      this.syncRadarrTags(),
    ])

    // Handle orphaned tag cleanup if enabled
    let orphanedCleanup: OrphanedTagCleanupResults | undefined = undefined

    if (this.cleanupOrphanedTags) {
      try {
        orphanedCleanup = await this.cleanupOrphanedUserTags()
        this.log.info('Completed orphaned user tag cleanup', orphanedCleanup)
      } catch (cleanupError) {
        this.log.error('Error during orphaned tag cleanup:', cleanupError)
      }
    }

    this.log.info('User tag synchronization complete', {
      sonarr: sonarrResults,
      radarr: radarrResults,
      orphanedCleanup,
    })

    return {
      sonarr: sonarrResults,
      radarr: radarrResults,
      orphanedCleanup,
    }
  }

  /**
   * Clean up tags for users that no longer exist in the system
   * This removes tags for deleted users from all content
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
        users.map((user) => this.getUserTagLabel(user)),
      )

      // Process Radarr instances
      const radarrManager = this.fastify.radarrManager
      const radarrInstances = await radarrManager.getAllInstances()
      results.radarr.instances = radarrInstances.length

      for (const instance of radarrInstances) {
        try {
          const radarrService = radarrManager.getRadarrService(instance.id)
          if (!radarrService) {
            this.log.warn(
              `Radarr service for instance ${instance.name} not found, skipping orphaned tag cleanup`,
            )
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
            this.log.info(
              `No orphaned user tags found in Radarr instance ${instance.name}`,
            )
            continue
          }

          this.log.info(
            `Found ${orphanedTags.length} orphaned user tags in Radarr instance ${instance.name}`,
          )

          // Get all movies to check for these tags
          const movies = await radarrService.fetchMovies(true)
          let processedCount = 0

          // Process each movie to remove orphaned tags
          for (const movie of Array.from(movies)) {
            try {
              // Extract Radarr ID
              const radarrId = this.extractRadarrId(movie.guids)
              if (radarrId === 0) {
                results.radarr.skipped++
                continue
              }

              // Get movie details with tags
              const movieDetails = await radarrService.getFromRadarr<
                RadarrItem & { tags: number[] }
              >(`movie/${radarrId}`)
              const existingTags = movieDetails.tags || []

              // Check if this movie has any of the orphaned tags
              const orphanedTagIds = orphanedTags.map((t) => t.id)
              const hasOrphanedTags = existingTags.some((tagId) =>
                orphanedTagIds.includes(tagId),
              )

              if (!hasOrphanedTags) {
                results.radarr.skipped++
                continue
              }

              // Filter out orphaned tags
              const newTags = existingTags.filter(
                (tagId) => !orphanedTagIds.includes(tagId),
              )

              // Update the movie tags
              await radarrService.updateMovieTags(radarrId, newTags)
              this.log.debug(
                `Removed orphaned tags from movie "${movie.title}"`,
              )
              results.radarr.removed++

              // Log progress periodically
              processedCount++
              if (processedCount % 10 === 0) {
                this.log.info(
                  `Processed ${processedCount}/${Array.from(movies).length} movies for orphaned tag cleanup in Radarr instance ${instance.name}`,
                )
              }
            } catch (error) {
              this.log.error(
                `Error cleaning up orphaned tags for movie "${movie.title}":`,
                error,
              )
              results.radarr.failed++
            }
          }

          this.log.info(
            `Completed orphaned tag cleanup for Radarr instance ${instance.name}: removed tags from ${results.radarr.removed} movies`,
          )
        } catch (instanceError) {
          this.log.error(
            `Error processing Radarr instance ${instance.name} for orphaned tag cleanup:`,
            instanceError,
          )
        }
      }

      // Process Sonarr instances
      const sonarrManager = this.fastify.sonarrManager
      const sonarrInstances = await sonarrManager.getAllInstances()
      results.sonarr.instances = sonarrInstances.length

      for (const instance of sonarrInstances) {
        try {
          const sonarrService = sonarrManager.getSonarrService(instance.id)
          if (!sonarrService) {
            this.log.warn(
              `Sonarr service for instance ${instance.name} not found, skipping orphaned tag cleanup`,
            )
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
            this.log.info(
              `No orphaned user tags found in Sonarr instance ${instance.name}`,
            )
            continue
          }

          this.log.info(
            `Found ${orphanedTags.length} orphaned user tags in Sonarr instance ${instance.name}`,
          )

          // Get all series to check for these tags
          const allSeries = await sonarrService.fetchSeries(true)
          let processedCount = 0

          // Process each series to remove orphaned tags
          for (const series of Array.from(allSeries)) {
            try {
              // Extract Sonarr ID
              const sonarrId = this.extractSonarrId(series.guids)
              if (sonarrId === 0) {
                results.sonarr.skipped++
                continue
              }

              // Get series details with tags
              const seriesDetails = await sonarrService.getFromSonarr<
                SonarrItem & { tags: number[] }
              >(`series/${sonarrId}`)
              const existingTags = seriesDetails.tags || []

              // Check if this series has any of the orphaned tags
              const orphanedTagIds = orphanedTags.map((t) => t.id)
              const hasOrphanedTags = existingTags.some((tagId) =>
                orphanedTagIds.includes(tagId),
              )

              if (!hasOrphanedTags) {
                results.sonarr.skipped++
                continue
              }

              // Filter out orphaned tags
              const newTags = existingTags.filter(
                (tagId) => !orphanedTagIds.includes(tagId),
              )

              // Update the series tags
              await sonarrService.updateSeriesTags(sonarrId, newTags)
              this.log.debug(
                `Removed orphaned tags from series "${series.title}"`,
              )
              results.sonarr.removed++

              // Log progress periodically
              processedCount++
              if (processedCount % 10 === 0) {
                this.log.info(
                  `Processed ${processedCount}/${Array.from(allSeries).length} series for orphaned tag cleanup in Sonarr instance ${instance.name}`,
                )
              }
            } catch (error) {
              this.log.error(
                `Error cleaning up orphaned tags for series "${series.title}":`,
                error,
              )
              results.sonarr.failed++
            }
          }

          this.log.info(
            `Completed orphaned tag cleanup for Sonarr instance ${instance.name}: removed tags from ${results.sonarr.removed} series`,
          )
        } catch (instanceError) {
          this.log.error(
            `Error processing Sonarr instance ${instance.name} for orphaned tag cleanup:`,
            instanceError,
          )
        }
      }

      return results
    } catch (error) {
      this.log.error('Error cleaning up orphaned user tags:', error)
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
    return `${this.tagPrefix}:${user.name.trim().toLowerCase()}`
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
   * Check if two arrays have the same elements (ignoring order)
   */
  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false

    const setA = new Set(a)
    const setB = new Set(b)

    if (setA.size !== setB.size) return false

    for (const item of setA) {
      if (!setB.has(item)) return false
    }

    return true
  }
}
