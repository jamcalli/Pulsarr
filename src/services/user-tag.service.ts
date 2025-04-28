import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { parseGuids, hasMatchingGuids } from '@utils/guid-handler.js'
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
 * Service to manage user tagging for media in Sonarr and Radarr
 */
export class UserTagService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  /**
   * Get current tagging configuration
   *
   * @returns Current tagging configuration
   */
  async getTaggingConfig(): Promise<{
    useAliasForTags: boolean
    tagUsersInSonarr: boolean
    tagUsersInRadarr: boolean
  }> {
    const config = await this.fastify.db.getConfig(1)

    return {
      useAliasForTags: config?.useAliasForTags !== true,
      tagUsersInSonarr: config?.tagUsersInSonarr === false,
      tagUsersInRadarr: config?.tagUsersInRadarr === false,
    }
  }

  /**
   * Create all necessary user tags in Sonarr instances
   *
   * @returns Results of tag creation operation
   */
  async createSonarrUserTags(): Promise<{
    created: number
    skipped: number
    instances: number
  }> {
    const config = await this.getTaggingConfig()

    if (!config.tagUsersInSonarr) {
      this.log.debug('Sonarr user tagging disabled, skipping tag creation')
      return { created: 0, skipped: 0, instances: 0 }
    }

    const results = { created: 0, skipped: 0, instances: 0 }

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

          // Get existing tags from Sonarr - using public getTags method
          const existingTags = await sonarrService.getTags()

          // Create a map of tag labels to IDs for quick lookup
          const tagLabelMap = new Map<string, number>()
          for (const tag of existingTags) {
            tagLabelMap.set(tag.label, tag.id)
          }

          // Create user tags if they don't exist
          for (const user of users) {
            const tagLabel = this.getUserTagLabel(user, config.useAliasForTags)

            if (!tagLabelMap.has(tagLabel)) {
              try {
                // Using public createTag method
                const newTag = await sonarrService.createTag(tagLabel)
                tagLabelMap.set(tagLabel, newTag.id)
                this.log.info(
                  `Created Sonarr tag "${tagLabel}" with ID ${newTag.id} for user ${user.name} in instance ${instance.name}`,
                )
                results.created++
              } catch (tagError) {
                this.log.error(
                  `Failed to create Sonarr tag "${tagLabel}" for user ${user.name} in instance ${instance.name}:`,
                  tagError,
                )
              }
            } else {
              results.skipped++
            }
          }

          this.log.info(
            `Processed user tags for Sonarr instance ${instance.name}`,
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
    instances: number
  }> {
    const config = await this.getTaggingConfig()

    if (!config.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping tag creation')
      return { created: 0, skipped: 0, instances: 0 }
    }

    const results = { created: 0, skipped: 0, instances: 0 }

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

          // Get existing tags from Radarr - using public getTags method
          const existingTags = await radarrService.getTags()

          // Create a map of tag labels to IDs for quick lookup
          const tagLabelMap = new Map<string, number>()
          for (const tag of existingTags) {
            tagLabelMap.set(tag.label, tag.id)
          }

          // Create user tags if they don't exist
          for (const user of users) {
            const tagLabel = this.getUserTagLabel(user, config.useAliasForTags)

            if (!tagLabelMap.has(tagLabel)) {
              try {
                // Using public createTag method
                const newTag = await radarrService.createTag(tagLabel)
                tagLabelMap.set(tagLabel, newTag.id)
                this.log.info(
                  `Created Radarr tag "${tagLabel}" with ID ${newTag.id} for user ${user.name} in instance ${instance.name}`,
                )
                results.created++
              } catch (tagError) {
                this.log.error(
                  `Failed to create Radarr tag "${tagLabel}" for user ${user.name} in instance ${instance.name}:`,
                  tagError,
                )
              }
            } else {
              results.skipped++
            }
          }

          this.log.info(
            `Processed user tags for Radarr instance ${instance.name}`,
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
   * Sync all Sonarr items with user tags - fetches all data internally
   * This is the standalone mode for API calls
   *
   * @returns Results of tagging operation
   */
  async syncSonarrTags(): Promise<TaggingResults> {
    const config = await this.getTaggingConfig()

    if (!config.tagUsersInSonarr) {
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
    const config = await this.getTaggingConfig()

    if (!config.tagUsersInRadarr) {
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
   * Tag Sonarr content using pre-fetched data
   * This is the integrated mode for use with the StatusService
   *
   * @param series All fetched series from Sonarr
   * @param watchlistItems All show watchlist items
   * @returns Results of tagging operation
   */
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
    const config = await this.getTaggingConfig()

    if (!config.tagUsersInSonarr) {
      this.log.debug('Sonarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    const results = { tagged: 0, skipped: 0, failed: 0 }

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

          // Get existing tags from Sonarr - using public getTags method
          const existingTags = await sonarrService.getTags()

          // Create a map of tag labels to IDs for quick lookup
          const tagLabelMap = new Map<string, number>()
          for (const tag of existingTags) {
            tagLabelMap.set(tag.label, tag.id)
          }

          // Create a map of tag IDs to labels for reverse lookup
          const tagIdMap = new Map<number, string>()
          for (const tag of existingTags) {
            tagIdMap.set(tag.id, tag.label)
          }

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

              if (showUsers.size === 0) {
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

              // Get tag IDs for users
              const userTagIds: number[] = []

              for (const userId of showUsers) {
                const user = userMap.get(userId)
                if (user) {
                  const tagLabel = this.getUserTagLabel(
                    user,
                    config.useAliasForTags,
                  )
                  const tagId = tagLabelMap.get(tagLabel)

                  if (tagId) {
                    userTagIds.push(tagId)
                  } else {
                    // Create tag if it doesn't exist yet
                    try {
                      // Using public createTag method
                      const newTag = await sonarrService.createTag(tagLabel)
                      tagLabelMap.set(tagLabel, newTag.id)
                      tagIdMap.set(newTag.id, tagLabel)
                      userTagIds.push(newTag.id)
                      this.log.info(
                        `Created tag "${tagLabel}" with ID ${newTag.id} for user ${user.name}`,
                      )
                    } catch (tagError) {
                      this.log.error(
                        `Failed to create tag for user ${user.name}:`,
                        tagError,
                      )
                    }
                  }
                }
              }

              if (userTagIds.length === 0) {
                results.skipped++
                continue
              }

              // Get existing tags and prepare new tag set
              const existingTags = seriesDetails.tags || []

              // Filter out any existing user tags
              const userTagLabels = new Set(
                users.map((user) =>
                  this.getUserTagLabel(user, config.useAliasForTags),
                ),
              )

              const nonUserTagIds = existingTags.filter((tagId) => {
                const tagLabel = tagIdMap.get(tagId)
                return !tagLabel || !userTagLabels.has(tagLabel)
              })

              // Combine non-user tags with new user tags
              const newTags = [...new Set([...nonUserTagIds, ...userTagIds])]

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
    const config = await this.getTaggingConfig()

    if (!config.tagUsersInRadarr) {
      this.log.debug('Radarr user tagging disabled, skipping content tagging')
      return { tagged: 0, skipped: 0, failed: 0 }
    }

    const results = { tagged: 0, skipped: 0, failed: 0 }

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

          // Get existing tags from Radarr - using public getTags method
          const existingTags = await radarrService.getTags()

          // Create a map of tag labels to IDs for quick lookup
          const tagLabelMap = new Map<string, number>()
          for (const tag of existingTags) {
            tagLabelMap.set(tag.label, tag.id)
          }

          // Create a map of tag IDs to labels for reverse lookup
          const tagIdMap = new Map<number, string>()
          for (const tag of existingTags) {
            tagIdMap.set(tag.id, tag.label)
          }

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

              if (movieUsers.size === 0) {
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

              // Get tag IDs for users
              const userTagIds: number[] = []

              for (const userId of movieUsers) {
                const user = userMap.get(userId)
                if (user) {
                  const tagLabel = this.getUserTagLabel(
                    user,
                    config.useAliasForTags,
                  )
                  const tagId = tagLabelMap.get(tagLabel)

                  if (tagId) {
                    userTagIds.push(tagId)
                  } else {
                    // Create tag if it doesn't exist yet
                    try {
                      // Using public createTag method
                      const newTag = await radarrService.createTag(tagLabel)
                      tagLabelMap.set(tagLabel, newTag.id)
                      tagIdMap.set(newTag.id, tagLabel)
                      userTagIds.push(newTag.id)
                      this.log.info(
                        `Created tag "${tagLabel}" with ID ${newTag.id} for user ${user.name}`,
                      )
                    } catch (tagError) {
                      this.log.error(
                        `Failed to create tag for user ${user.name}:`,
                        tagError,
                      )
                    }
                  }
                }
              }

              if (userTagIds.length === 0) {
                results.skipped++
                continue
              }

              // Get existing tags and prepare new tag set
              const existingTags = movieDetails.tags || []

              // Filter out any existing user tags
              const userTagLabels = new Set(
                users.map((user) =>
                  this.getUserTagLabel(user, config.useAliasForTags),
                ),
              )

              const nonUserTagIds = existingTags.filter((tagId) => {
                const tagLabel = tagIdMap.get(tagId)
                return !tagLabel || !userTagLabels.has(tagLabel)
              })

              // Combine non-user tags with new user tags
              const newTags = [...new Set([...nonUserTagIds, ...userTagIds])]

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
   * Sync all tags (both Sonarr and Radarr)
   * This is the main method for API calls
   *
   * @returns Results of all tagging operations
   */
  async syncAllTags(): Promise<{
    sonarr: TaggingResults
    radarr: TaggingResults
  }> {
    this.log.info('Starting complete user tag synchronization')

    const [sonarrResults, radarrResults] = await Promise.all([
      this.syncSonarrTags(),
      this.syncRadarrTags(),
    ])

    this.log.info('User tag synchronization complete', {
      sonarr: sonarrResults,
      radarr: radarrResults,
    })

    return {
      sonarr: sonarrResults,
      radarr: radarrResults,
    }
  }

  /**
   * Get the tag label for a user
   */
  private getUserTagLabel(
    user: { name: string; alias?: string | null },
    useAlias: boolean,
  ): string {
    const displayName = useAlias && user.alias ? user.alias : user.name
    return `user:${displayName}`
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
