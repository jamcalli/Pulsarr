import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { hasMatchingGuids } from '@utils/guid-handler.js'
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
        const lowerLabel = tagInfo.label.toLowerCase()
        tagLabelMap.set(lowerLabel, newTag.id)
        tagIdMap.set(newTag.id, lowerLabel)
        createdCount++
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
   * Tag Sonarr content using pre-fetched data with batching and progress reporting
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
    const operationId = `sonarr-tagging-${Date.now()}`
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'start',
          progress: 0,
          message: 'Initializing Sonarr user tagging...',
        })
      }

      // Get all users for tag lookup
      const users = await this.fastify.db.getAllUsers()

      // Create a map of user IDs to user objects
      const userMap = new Map(users.map((user) => [user.id, user]))

      // Process each Sonarr instance
      const sonarrManager = this.fastify.sonarrManager
      const sonarrInstances = await sonarrManager.getAllInstances()

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'processing',
          progress: 5,
          message: `Processing ${sonarrInstances.length} Sonarr instances for tagging`,
        })
      }

      let instancesProcessed = 0
      const totalInstances = sonarrInstances.length

      for (const instance of sonarrInstances) {
        try {
          const sonarrService = sonarrManager.getSonarrService(instance.id)

          if (!sonarrService) {
            this.log.warn(
              `Sonarr service for instance ${instance.name} not found, skipping tagging`,
            )
            instancesProcessed++
            continue
          }

          if (emitProgress) {
            this.emitProgress({
              operationId,
              type: 'sonarr-tagging',
              phase: 'processing-instance',
              progress:
                5 + Math.floor((instancesProcessed / totalInstances) * 30),
              message: `Processing Sonarr instance ${instance.name} (${instancesProcessed + 1}/${totalInstances})`,
            })
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

          if (emitProgress) {
            this.emitProgress({
              operationId,
              type: 'sonarr-tagging',
              phase: 'tagging-series',
              progress:
                35 + Math.floor((instancesProcessed / totalInstances) * 30),
              message: `Tagging ${instanceSeries.length} series in Sonarr instance ${instance.name}`,
            })
          }

          // Process series in batches
          const BATCH_SIZE = 5 // Number of items to process in parallel
          let seriesProcessed = 0

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

                // Skip processing if no users have this in watchlist and we're not in cleanup mode
                if (showUsers.size === 0 && this.persistHistoricalTags) {
                  return { tagged: false, skipped: true, failed: false }
                }

                // Extract Sonarr ID
                const sonarrId = this.extractSonarrId(show.guids)
                if (sonarrId === 0) {
                  this.log.warn(
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
              if (result.tagged) results.tagged++
              if (result.skipped) results.skipped++
              if (result.failed) results.failed++
            }

            seriesProcessed += batch.length

            if (emitProgress) {
              const instanceProgressBase =
                35 + Math.floor((instancesProcessed / totalInstances) * 30)
              const itemProgress = Math.floor(
                (seriesProcessed / instanceSeries.length) * 30,
              )
              this.emitProgress({
                operationId,
                type: 'sonarr-tagging',
                phase: 'tagging-series',
                progress: instanceProgressBase + itemProgress,
                message: `Tagged ${seriesProcessed}/${instanceSeries.length} series in Sonarr instance ${instance.name}`,
              })
            }
          }

          this.log.info(
            `Completed tagging for Sonarr instance ${instance.name}`,
            {
              tagged: results.tagged,
              skipped: results.skipped,
              failed: results.failed,
            },
          )

          instancesProcessed++
        } catch (instanceError) {
          this.log.error(
            `Error processing Sonarr instance ${instance.name} for tagging:`,
            instanceError,
          )
          instancesProcessed++
        }
      }

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'complete',
          progress: 100,
          message: `Completed tagging ${results.tagged} series across ${sonarrInstances.length} Sonarr instances`,
        })
      }

      return results
    } catch (error) {
      this.log.error('Error tagging Sonarr content:', error)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'error',
          progress: 100,
          message: `Error tagging Sonarr content: ${error}`,
        })
      }

      throw error
    }
  }

  /**
   * Tag Radarr content using pre-fetched data with batching and progress reporting
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
    const operationId = `radarr-tagging-${Date.now()}`
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'start',
          progress: 0,
          message: 'Initializing Radarr user tagging...',
        })
      }

      // Get all users for tag lookup
      const users = await this.fastify.db.getAllUsers()

      // Create a map of user IDs to user objects
      const userMap = new Map(users.map((user) => [user.id, user]))

      // Process each Radarr instance
      const radarrManager = this.fastify.radarrManager
      const radarrInstances = await radarrManager.getAllInstances()

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'processing',
          progress: 5,
          message: `Processing ${radarrInstances.length} Radarr instances for tagging`,
        })
      }

      let instancesProcessed = 0
      const totalInstances = radarrInstances.length

      for (const instance of radarrInstances) {
        try {
          const radarrService = radarrManager.getRadarrService(instance.id)

          if (!radarrService) {
            this.log.warn(
              `Radarr service for instance ${instance.name} not found, skipping tagging`,
            )
            instancesProcessed++
            continue
          }

          if (emitProgress) {
            this.emitProgress({
              operationId,
              type: 'radarr-tagging',
              phase: 'processing-instance',
              progress:
                5 + Math.floor((instancesProcessed / totalInstances) * 30),
              message: `Processing Radarr instance ${instance.name} (${instancesProcessed + 1}/${totalInstances})`,
            })
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

          if (emitProgress) {
            this.emitProgress({
              operationId,
              type: 'radarr-tagging',
              phase: 'tagging-movies',
              progress:
                35 + Math.floor((instancesProcessed / totalInstances) * 30),
              message: `Tagging ${instanceMovies.length} movies in Radarr instance ${instance.name}`,
            })
          }

          // Process movies in batches
          const BATCH_SIZE = 5 // Number of items to process in parallel
          let moviesProcessed = 0

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

                // Skip processing if no users have this in watchlist and we're not in cleanup mode
                if (movieUsers.size === 0 && this.persistHistoricalTags) {
                  return { tagged: false, skipped: true, failed: false }
                }

                // Extract Radarr ID
                const radarrId = this.extractRadarrId(movie.guids)
                if (radarrId === 0) {
                  this.log.warn(
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
              if (result.tagged) results.tagged++
              if (result.skipped) results.skipped++
              if (result.failed) results.failed++
            }

            moviesProcessed += batch.length

            if (emitProgress) {
              const instanceProgressBase =
                35 + Math.floor((instancesProcessed / totalInstances) * 30)
              const itemProgress = Math.floor(
                (moviesProcessed / instanceMovies.length) * 30,
              )
              this.emitProgress({
                operationId,
                type: 'radarr-tagging',
                phase: 'tagging-movies',
                progress: instanceProgressBase + itemProgress,
                message: `Tagged ${moviesProcessed}/${instanceMovies.length} movies in Radarr instance ${instance.name}`,
              })
            }
          }

          this.log.info(
            `Completed tagging for Radarr instance ${instance.name}`,
            {
              tagged: results.tagged,
              skipped: results.skipped,
              failed: results.failed,
            },
          )

          instancesProcessed++
        } catch (instanceError) {
          this.log.error(
            `Error processing Radarr instance ${instance.name} for tagging:`,
            instanceError,
          )
          instancesProcessed++
        }
      }

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'complete',
          progress: 100,
          message: `Completed tagging ${results.tagged} movies across ${radarrInstances.length} Radarr instances`,
        })
      }

      return results
    } catch (error) {
      this.log.error('Error tagging Radarr content:', error)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'error',
          progress: 100,
          message: `Error tagging Radarr content: ${error}`,
        })
      }

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

    const operationId = `sonarr-tag-sync-${Date.now()}`
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'start',
          progress: 0,
          message: 'Starting Sonarr tag synchronization...',
        })
      }

      // Create user tags first
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'creating-tags',
          progress: 5,
          message: 'Creating user tags in Sonarr...',
        })
      }

      await this.createSonarrUserTags()

      // Fetch all shows and series needed for tagging
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'fetching-data',
          progress: 20,
          message: 'Fetching series data from Sonarr...',
        })
      }

      const existingSeries =
        await this.fastify.sonarrManager.fetchAllSeries(true)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'fetching-watchlist',
          progress: 40,
          message: 'Fetching watchlist data...',
        })
      }

      const watchlistItems = await this.fastify.db.getAllShowWatchlistItems()

      // Apply tags using the fetched data
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tagging',
          phase: 'applying-tags',
          progress: 60,
          message: `Applying tags to ${existingSeries.length} series...`,
        })
      }

      const results = await this.tagSonarrContentWithData(
        existingSeries,
        watchlistItems,
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
   * This is the standalone mode for API calls
   *
   * @returns Results of tagging operation
   */
  async syncRadarrTags(): Promise<TaggingResults> {
    if (!this.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    const operationId = `radarr-tag-sync-${Date.now()}`
    const emitProgress = this.hasActiveProgressConnections()

    try {
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'start',
          progress: 0,
          message: 'Starting Radarr tag synchronization...',
        })
      }

      // Create user tags first
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'creating-tags',
          progress: 5,
          message: 'Creating user tags in Radarr...',
        })
      }

      await this.createRadarrUserTags()

      // Fetch all movies and watchlist items needed for tagging
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'fetching-data',
          progress: 20,
          message: 'Fetching movie data from Radarr...',
        })
      }

      const existingMovies =
        await this.fastify.radarrManager.fetchAllMovies(true)

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'fetching-watchlist',
          progress: 40,
          message: 'Fetching watchlist data...',
        })
      }

      const watchlistItems = await this.fastify.db.getAllMovieWatchlistItems()

      // Apply tags using the fetched data
      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tagging',
          phase: 'applying-tags',
          progress: 60,
          message: `Applying tags to ${existingMovies.length} movies...`,
        })
      }

      const results = await this.tagRadarrContentWithData(
        existingMovies,
        watchlistItems,
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
    this.log.info('Starting complete user tag synchronization in parallel')

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
          progress: 0,
          message: 'Starting Sonarr user tag removal...',
        })
      }

      // Process each Sonarr instance
      const sonarrManager = this.fastify.sonarrManager
      const sonarrInstances = await sonarrManager.getAllInstances()
      results.instances = sonarrInstances.length

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'sonarr-tag-removal',
          phase: 'processing',
          progress: 5,
          message: `Processing ${sonarrInstances.length} Sonarr instances for tag removal`,
        })
      }

      let instancesProcessed = 0

      for (const instance of sonarrInstances) {
        try {
          const sonarrService = sonarrManager.getSonarrService(instance.id)

          if (!sonarrService) {
            this.log.warn(
              `Sonarr service for instance ${instance.name} not found, skipping tag removal`,
            )
            instancesProcessed++
            continue
          }

          if (emitProgress) {
            const instanceProgress =
              5 + Math.floor((instancesProcessed / sonarrInstances.length) * 30)
            this.emitProgress({
              operationId,
              type: 'sonarr-tag-removal',
              phase: 'processing-instance',
              progress: instanceProgress,
              message: `Processing Sonarr instance ${instance.name} (${instancesProcessed + 1}/${sonarrInstances.length})`,
            })
          }

          // Get all tags from this instance
          const tags = await sonarrService.getTags()

          // Find all user tags (those with our prefix)
          const userTags = tags.filter((tag) => this.isAppUserTag(tag.label))

          if (userTags.length === 0) {
            this.log.info(
              `No user tags found in Sonarr instance ${instance.name}, skipping`,
            )
            instancesProcessed++
            continue
          }

          this.log.info(
            `Found ${userTags.length} user tags in Sonarr instance ${instance.name}`,
          )

          // Extract the IDs of user tags
          const userTagIds = userTags.map((tag) => tag.id)

          // Get all series to check for these tags
          const allSeries = await sonarrService.fetchSeries(true)
          this.log.info(
            `Processing ${Array.from(allSeries).length} series in Sonarr instance ${instance.name} for tag removal`,
          )

          if (emitProgress) {
            const instanceBaseProgress =
              35 +
              Math.floor((instancesProcessed / sonarrInstances.length) * 30)
            this.emitProgress({
              operationId,
              type: 'sonarr-tag-removal',
              phase: 'processing-series',
              progress: instanceBaseProgress,
              message: `Processing ${Array.from(allSeries).length} series in Sonarr instance ${instance.name}`,
            })
          }

          let instanceUpdatedCount = 0
          let instanceTagsRemovedCount = 0

          // Process series in batches
          const BATCH_SIZE = 10
          let processedCount = 0

          for (let i = 0; i < Array.from(allSeries).length; i += BATCH_SIZE) {
            const batch = Array.from(allSeries).slice(i, i + BATCH_SIZE)
            const batchPromises = batch.map(async (series) => {
              try {
                results.itemsProcessed++

                // Extract Sonarr ID
                const sonarrId = this.extractSonarrId(series.guids)
                if (sonarrId === 0) {
                  return { updated: false, tagsRemoved: 0, failed: false }
                }

                // Get series details with tags
                const seriesDetails = await sonarrService.getFromSonarr<
                  SonarrItem & { tags: number[] }
                >(`series/${sonarrId}`)
                const existingTags = seriesDetails.tags || []

                // Check if this series has any of our user tags
                const hasUserTags = existingTags.some((tagId) =>
                  userTagIds.includes(tagId),
                )

                if (!hasUserTags) {
                  return { updated: false, tagsRemoved: 0, failed: false }
                }

                // Filter out user tags
                const newTags = existingTags.filter(
                  (tagId) => !userTagIds.includes(tagId),
                )

                const tagsRemoved = existingTags.length - newTags.length

                // Update the series tags
                await sonarrService.updateSeriesTags(sonarrId, newTags)
                this.log.debug(
                  `Removed ${tagsRemoved} user tags from series "${series.title}"`,
                )

                return { updated: true, tagsRemoved, failed: false }
              } catch (error) {
                this.log.error(
                  `Error removing tags from series "${series.title}":`,
                  error,
                )
                return { updated: false, tagsRemoved: 0, failed: true }
              }
            })

            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises)

            // Update counts
            for (const result of batchResults) {
              if (result.updated) {
                results.itemsUpdated++
                instanceUpdatedCount++
              }
              if (result.tagsRemoved > 0) {
                results.tagsRemoved += result.tagsRemoved
                instanceTagsRemovedCount += result.tagsRemoved
              }
              if (result.failed) {
                results.failed++
              }
            }

            processedCount += batch.length

            if (emitProgress && Array.from(allSeries).length > 0) {
              const instanceBaseProgress =
                35 +
                Math.floor((instancesProcessed / sonarrInstances.length) * 30)
              const seriesProgress = Math.floor(
                (processedCount / Array.from(allSeries).length) * 15,
              )
              this.emitProgress({
                operationId,
                type: 'sonarr-tag-removal',
                phase: 'processing-series',
                progress: instanceBaseProgress + seriesProgress,
                message: `Processed ${processedCount}/${Array.from(allSeries).length} series in Sonarr instance ${instance.name}`,
              })
            }

            // Log progress periodically
            if (
              processedCount % 50 === 0 ||
              processedCount === Array.from(allSeries).length
            ) {
              this.log.info(
                `Processed ${processedCount}/${Array.from(allSeries).length} series for tag removal in Sonarr instance ${instance.name}`,
              )
            }
          }

          this.log.info(
            `Completed tag removal for Sonarr instance ${instance.name}: ` +
              `updated ${instanceUpdatedCount} series, removed ${instanceTagsRemovedCount} tags`,
          )

          // Delete tag definitions if requested
          if (deleteTagDefinitions && userTags.length > 0) {
            if (emitProgress) {
              const instanceBaseProgress =
                65 +
                Math.floor((instancesProcessed / sonarrInstances.length) * 30)
              this.emitProgress({
                operationId,
                type: 'sonarr-tag-removal',
                phase: 'deleting-tags',
                progress: instanceBaseProgress,
                message: `Deleting ${userTags.length} tag definitions from Sonarr instance ${instance.name}`,
              })
            }

            // Process tag deletions in batches
            const TAG_BATCH_SIZE = 5
            let deletedCount = 0

            for (let i = 0; i < userTags.length; i += TAG_BATCH_SIZE) {
              const tagBatch = userTags.slice(i, i + TAG_BATCH_SIZE)
              const tagPromises = tagBatch.map(async (tag) => {
                try {
                  await sonarrService.deleteTag(tag.id)
                  return true
                } catch (error) {
                  this.log.error(
                    `Error deleting tag ID ${tag.id} from Sonarr:`,
                    error,
                  )
                  return false
                }
              })

              const deleteResults = await Promise.all(tagPromises)
              deletedCount += deleteResults.filter(Boolean).length

              if (emitProgress) {
                const tagBaseProgress =
                  65 +
                  Math.floor((instancesProcessed / sonarrInstances.length) * 30)
                const tagProgress = Math.floor(
                  (deletedCount / userTags.length) * 5,
                )
                this.emitProgress({
                  operationId,
                  type: 'sonarr-tag-removal',
                  phase: 'deleting-tags',
                  progress: tagBaseProgress + tagProgress,
                  message: `Deleted ${deletedCount}/${userTags.length} tag definitions from Sonarr instance ${instance.name}`,
                })
              }
            }

            results.tagsDeleted += deletedCount
            this.log.info(
              `Deleted ${deletedCount} user tag definitions from Sonarr instance ${instance.name}`,
            )
          }

          instancesProcessed++
        } catch (instanceError) {
          this.log.error(
            `Error processing Sonarr instance ${instance.name} for tag removal:`,
            instanceError,
          )
          instancesProcessed++
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
          progress: 0,
          message: 'Starting Radarr user tag removal...',
        })
      }

      // Process each Radarr instance
      const radarrManager = this.fastify.radarrManager
      const radarrInstances = await radarrManager.getAllInstances()
      results.instances = radarrInstances.length

      if (emitProgress) {
        this.emitProgress({
          operationId,
          type: 'radarr-tag-removal',
          phase: 'processing',
          progress: 5,
          message: `Processing ${radarrInstances.length} Radarr instances for tag removal`,
        })
      }

      let instancesProcessed = 0

      for (const instance of radarrInstances) {
        try {
          const radarrService = radarrManager.getRadarrService(instance.id)

          if (!radarrService) {
            this.log.warn(
              `Radarr service for instance ${instance.name} not found, skipping tag removal`,
            )
            instancesProcessed++
            continue
          }

          if (emitProgress) {
            const instanceProgress =
              5 + Math.floor((instancesProcessed / radarrInstances.length) * 30)
            this.emitProgress({
              operationId,
              type: 'radarr-tag-removal',
              phase: 'processing-instance',
              progress: instanceProgress,
              message: `Processing Radarr instance ${instance.name} (${instancesProcessed + 1}/${radarrInstances.length})`,
            })
          }

          // Get all tags from this instance
          const tags = await radarrService.getTags()

          // Find all user tags (those with our prefix)
          const userTags = tags.filter((tag) => this.isAppUserTag(tag.label))

          if (userTags.length === 0) {
            this.log.info(
              `No user tags found in Radarr instance ${instance.name}, skipping`,
            )
            instancesProcessed++
            continue
          }

          this.log.info(
            `Found ${userTags.length} user tags in Radarr instance ${instance.name}`,
          )

          // Extract the IDs of user tags
          const userTagIds = userTags.map((tag) => tag.id)

          // Get all movies to check for these tags
          const allMovies = await radarrService.fetchMovies(true)
          this.log.info(
            `Processing ${Array.from(allMovies).length} movies in Radarr instance ${instance.name} for tag removal`,
          )

          if (emitProgress) {
            const instanceBaseProgress =
              35 +
              Math.floor((instancesProcessed / radarrInstances.length) * 30)
            this.emitProgress({
              operationId,
              type: 'radarr-tag-removal',
              phase: 'processing-movies',
              progress: instanceBaseProgress,
              message: `Processing ${Array.from(allMovies).length} movies in Radarr instance ${instance.name}`,
            })
          }

          let instanceUpdatedCount = 0
          let instanceTagsRemovedCount = 0

          // Process movies in batches
          const BATCH_SIZE = 10
          let processedCount = 0

          for (let i = 0; i < Array.from(allMovies).length; i += BATCH_SIZE) {
            const batch = Array.from(allMovies).slice(i, i + BATCH_SIZE)
            const batchPromises = batch.map(async (movie) => {
              try {
                results.itemsProcessed++

                // Extract Radarr ID
                const radarrId = this.extractRadarrId(movie.guids)
                if (radarrId === 0) {
                  return { updated: false, tagsRemoved: 0, failed: false }
                }

                // Get movie details with tags
                const movieDetails = await radarrService.getFromRadarr<
                  RadarrItem & { tags: number[] }
                >(`movie/${radarrId}`)
                const existingTags = movieDetails.tags || []

                // Check if this movie has any of our user tags
                const hasUserTags = existingTags.some((tagId) =>
                  userTagIds.includes(tagId),
                )

                if (!hasUserTags) {
                  return { updated: false, tagsRemoved: 0, failed: false }
                }

                // Filter out user tags
                const newTags = existingTags.filter(
                  (tagId) => !userTagIds.includes(tagId),
                )

                const tagsRemoved = existingTags.length - newTags.length

                // Update the movie tags
                await radarrService.updateMovieTags(radarrId, newTags)
                this.log.debug(
                  `Removed ${tagsRemoved} user tags from movie "${movie.title}"`,
                )

                return { updated: true, tagsRemoved, failed: false }
              } catch (error) {
                this.log.error(
                  `Error removing tags from movie "${movie.title}":`,
                  error,
                )
                return { updated: false, tagsRemoved: 0, failed: true }
              }
            })

            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises)

            // Update counts
            for (const result of batchResults) {
              if (result.updated) {
                results.itemsUpdated++
                instanceUpdatedCount++
              }
              if (result.tagsRemoved > 0) {
                results.tagsRemoved += result.tagsRemoved
                instanceTagsRemovedCount += result.tagsRemoved
              }
              if (result.failed) {
                results.failed++
              }
            }

            processedCount += batch.length

            if (emitProgress && Array.from(allMovies).length > 0) {
              const instanceBaseProgress =
                35 +
                Math.floor((instancesProcessed / radarrInstances.length) * 30)
              const moviesProgress = Math.floor(
                (processedCount / Array.from(allMovies).length) * 15,
              )
              this.emitProgress({
                operationId,
                type: 'radarr-tag-removal',
                phase: 'processing-movies',
                progress: instanceBaseProgress + moviesProgress,
                message: `Processed ${processedCount}/${Array.from(allMovies).length} movies in Radarr instance ${instance.name}`,
              })
            }

            // Log progress periodically
            if (
              processedCount % 50 === 0 ||
              processedCount === Array.from(allMovies).length
            ) {
              this.log.info(
                `Processed ${processedCount}/${Array.from(allMovies).length} movies for tag removal in Radarr instance ${instance.name}`,
              )
            }
          }

          this.log.info(
            `Completed tag removal for Radarr instance ${instance.name}: ` +
              `updated ${instanceUpdatedCount} movies, removed ${instanceTagsRemovedCount} tags`,
          )

          // Delete tag definitions if requested
          if (deleteTagDefinitions && userTags.length > 0) {
            if (emitProgress) {
              const instanceBaseProgress =
                65 +
                Math.floor((instancesProcessed / radarrInstances.length) * 30)
              this.emitProgress({
                operationId,
                type: 'radarr-tag-removal',
                phase: 'deleting-tags',
                progress: instanceBaseProgress,
                message: `Deleting ${userTags.length} tag definitions from Radarr instance ${instance.name}`,
              })
            }

            // Process tag deletions in batches
            const TAG_BATCH_SIZE = 5
            let deletedCount = 0

            for (let i = 0; i < userTags.length; i += TAG_BATCH_SIZE) {
              const tagBatch = userTags.slice(i, i + TAG_BATCH_SIZE)
              const tagPromises = tagBatch.map(async (tag) => {
                try {
                  await radarrService.deleteTag(tag.id)
                  return true
                } catch (error) {
                  this.log.error(
                    `Error deleting tag ID ${tag.id} from Radarr:`,
                    error,
                  )
                  return false
                }
              })

              const deleteResults = await Promise.all(tagPromises)
              deletedCount += deleteResults.filter(Boolean).length

              if (emitProgress) {
                const tagBaseProgress =
                  65 +
                  Math.floor((instancesProcessed / radarrInstances.length) * 30)
                const tagProgress = Math.floor(
                  (deletedCount / userTags.length) * 5,
                )
                this.emitProgress({
                  operationId,
                  type: 'radarr-tag-removal',
                  phase: 'deleting-tags',
                  progress: tagBaseProgress + tagProgress,
                  message: `Deleted ${deletedCount}/${userTags.length} tag definitions from Radarr instance ${instance.name}`,
                })
              }
            }

            results.tagsDeleted += deletedCount
            this.log.info(
              `Deleted ${deletedCount} user tag definitions from Radarr instance ${instance.name}`,
            )
          }

          instancesProcessed++
        } catch (instanceError) {
          this.log.error(
            `Error processing Radarr instance ${instance.name} for tag removal:`,
            instanceError,
          )
          instancesProcessed++
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
    // Validate the tag prefix meets our requirements (consistent with API validation)
    if (!/^[a-zA-Z0-9_\-:.]+$/.test(this.tagPrefix)) {
      this.log.warn(
        `Invalid tag prefix format: "${this.tagPrefix}". Using default "pulsarr:user" instead.`,
      )
      return `pulsarr:user:${user.name.trim().toLowerCase()}`
    }

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
          this.log.info(
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
          this.log.info(
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
