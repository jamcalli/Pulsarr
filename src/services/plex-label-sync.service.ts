/**
 * Plex Label Sync Service
 *
 * Handles synchronization of Plex labels based on user watchlists and content requests.
 * Supports both webhook-triggered real-time syncing and scheduled batch processing.
 *
 * Key Features:
 * - Webhook-triggered label updates (real-time)
 * - Batch synchronization of all content
 * - Retry logic with exponential backoff
 * - Pending sync queue for items not yet available in Plex
 * - User label management with configurable format
 * - Content GUID matching and resolution
 * - Configurable concurrency control for optimal performance
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexServerService } from '@utils/plex-server.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexLabelTracking } from '@services/database/methods/plex-label-tracking.js'
import type { PendingLabelSyncWithPlexKeys } from '@services/database/methods/plex-label-sync.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import type {
  SyncResult,
  GroupedWatchlistContent,
  ContentWithUsers,
  PlexContentItems,
  LabelReconciliationResult,
  RadarrMovieWithTags,
  SonarrSeriesWithTags,
} from '@root/types/plex-label-sync.types.js'
import pLimit from 'p-limit'
import { parseGuids } from '@utils/guid-handler.js'

/**
 * Service to manage label synchronization between Pulsarr and Plex
 */
export class PlexLabelSyncService {
  /**
   * Creates a new PlexLabelSyncService instance
   *
   * @param log - Fastify logger instance
   * @param plexServer - PlexServerService instance for Plex API operations
   * @param db - DatabaseService instance for data operations
   * @param fastify - Fastify instance for accessing runtime config
   */
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly plexServer: PlexServerService,
    private readonly db: DatabaseService,
    private readonly fastify: FastifyInstance,
  ) {
    this.log.info('Initializing PlexLabelSyncService', {
      enabled: this.config.enabled,
      labelPrefix: this.config.labelPrefix,
      removedLabelMode: this.config.removedLabelMode || 'remove',
      removedLabelPrefix: this.config.removedLabelPrefix || 'pulsarr:removed',
    })
  }

  /**
   * Access to Plex label sync configuration
   */
  private get config(): PlexLabelSyncConfig {
    return (
      this.fastify.config.plexLabelSync || {
        enabled: false,
        labelPrefix: 'pulsarr',
        concurrencyLimit: 5,
        cleanupOrphanedLabels: false,
        removedLabelMode: 'remove' as const,
        removedLabelPrefix: 'pulsarr:removed',
        scheduleTime: undefined,
        dayOfWeek: '*',
        tagSync: {
          enabled: false,
          syncRadarrTags: true,
          syncSonarrTags: true,
        },
      }
    )
  }

  /**
   * Gets the configured label cleanup mode
   */
  private get removedLabelMode(): 'remove' | 'keep' | 'special-label' {
    return this.config.removedLabelMode || 'remove'
  }

  /**
   * Gets the prefix for special "removed" labels
   */
  private get removedLabelPrefix(): string {
    return this.config.removedLabelPrefix || 'pulsarr:removed'
  }

  /**
   * Checks if a label was created by this app based on the configured prefix
   *
   * @param labelName - The label to check
   * @returns True if this is an app-managed user label
   */
  private isAppUserLabel(labelName: string): boolean {
    return labelName.toLowerCase().startsWith(`${this.config.labelPrefix}:`)
  }

  /**
   * Checks if a label is a user-specific label (format: prefix:user:username)
   *
   * @param labelName - The label to check
   * @returns True if this is a user-specific label
   */
  private isUserSpecificLabel(labelName: string): boolean {
    const userPattern = new RegExp(`^${this.config.labelPrefix}:user:`, 'i')
    return userPattern.test(labelName)
  }

  /**
   * Checks if a label is a tag label managed by this app (format: prefix:tagname)
   * Tag labels are app labels that are NOT user-specific labels
   *
   * @param labelName - The label to check
   * @returns True if this is an app-managed tag label
   */
  private isAppTagLabel(labelName: string): boolean {
    return (
      this.isAppUserLabel(labelName) && !this.isUserSpecificLabel(labelName)
    )
  }

  /**
   * Checks if a tag is managed by the user tagging system
   *
   * @param tagName - The tag to check
   * @returns True if this is a user tagging system tag
   */
  private isUserTaggingSystemTag(tagName: string): boolean {
    const tagPrefix = this.fastify.config.tagPrefix || 'pulsarr:user'
    const userTagPattern = new RegExp(`^${this.escapeRegex(tagPrefix)}:`, 'i')
    return userTagPattern.test(tagName)
  }

  /**
   * Escapes special regex characters in a string
   *
   * @param string - The string to escape
   * @returns Escaped string safe for regex
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Gets the removed label string for tracking removed users
   *
   * @param itemName - The name of the content item (for logging)
   * @returns The removed label string
   */
  private async getRemovedLabel(itemName: string): Promise<string> {
    const removedLabel = this.removedLabelPrefix

    this.log.debug('Using removed label for content', {
      itemName,
      removedLabel,
    })

    return removedLabel
  }

  /**
   * Fetches all movies from Radarr instances with their tags
   *
   * @returns Array of movies with tags from all Radarr instances
   */
  private async fetchAllRadarrMovies(): Promise<RadarrMovieWithTags[]> {
    if (!this.config.tagSync.enabled || !this.config.tagSync.syncRadarrTags) {
      return []
    }

    try {
      this.log.debug(
        'Fetching all Radarr movies for tag sync from individual services',
      )
      const processedMovies: RadarrMovieWithTags[] = []

      const instances = await this.fastify.radarrManager.getAllInstances()

      for (const instance of instances) {
        try {
          const radarrService = this.fastify.radarrManager.getRadarrService(
            instance.id,
          )
          if (!radarrService) {
            this.log.warn(
              `Could not get Radarr service for instance ${instance.id}`,
            )
            continue
          }

          const instanceMovies = await radarrService.getAllMovies()
          const instanceTags = await radarrService.getTags()

          const tagMap = new Map(
            instanceTags.map((tag: { id: number; label: string }) => [
              tag.id,
              tag.label,
            ]),
          )

          for (const movie of instanceMovies) {
            const tags =
              movie.tags
                ?.map((tagId: number) => tagMap.get(tagId))
                .filter((tag): tag is string => Boolean(tag)) || []

            processedMovies.push({
              instanceId: instance.id,
              instanceName: instance.name,
              movie,
              tags,
            })
          }

          this.log.debug(
            `Processed ${instanceMovies.length} movies from instance ${instance.name}`,
          )
        } catch (error) {
          this.log.error(
            `Error processing movies from instance ${instance.id} (${instance.name}):`,
            error,
          )
        }
      }

      this.log.info(
        `Processed ${processedMovies.length} total movies for tag sync`,
      )
      return processedMovies
    } catch (error) {
      this.log.error('Error fetching Radarr movies for tag sync:', error)
      return []
    }
  }

  /**
   * Fetches all series from Sonarr instances with their tags
   *
   * @returns Array of series with tags from all Sonarr instances
   */
  private async fetchAllSonarrSeries(): Promise<SonarrSeriesWithTags[]> {
    if (!this.config.tagSync.enabled || !this.config.tagSync.syncSonarrTags) {
      return []
    }

    try {
      this.log.debug(
        'Fetching all Sonarr series for tag sync from individual services',
      )
      const processedSeries: SonarrSeriesWithTags[] = []

      const instances = await this.fastify.sonarrManager.getAllInstances()

      for (const instance of instances) {
        try {
          const sonarrService = this.fastify.sonarrManager.getSonarrService(
            instance.id,
          )
          if (!sonarrService) {
            this.log.warn(
              `Could not get Sonarr service for instance ${instance.id}`,
            )
            continue
          }

          const instanceSeries = await sonarrService.getAllSeries()
          const [instanceTags, rootFolders] = await Promise.all([
            sonarrService.getTags(),
            sonarrService.fetchRootFolders(),
          ])

          const tagMap = new Map(
            instanceTags.map((tag: { id: number; label: string }) => [
              tag.id,
              tag.label,
            ]),
          )

          const rootFolder =
            rootFolders.length > 0 ? rootFolders[0].path : undefined

          for (const series of instanceSeries) {
            const tags =
              series.tags
                ?.map((tagId: number) => tagMap.get(tagId))
                .filter((tag): tag is string => Boolean(tag)) || []

            processedSeries.push({
              instanceId: instance.id,
              instanceName: instance.name,
              series,
              tags,
              rootFolder,
            })
          }

          this.log.debug(
            `Processed ${instanceSeries.length} series from instance ${instance.name}`,
          )
        } catch (error) {
          this.log.error(
            `Error processing series from instance ${instance.id} (${instance.name}):`,
            error,
          )
        }
      }

      this.log.info(
        `Processed ${processedSeries.length} total series for tag sync`,
      )
      return processedSeries
    } catch (error) {
      this.log.error('Error fetching Sonarr series for tag sync:', error)
      return []
    }
  }

  /**
   * Matches a Plex movie to a Radarr movie based on file paths
   *
   * @param plexItem - The Plex movie item
   * @param radarrMovies - Array of Radarr movies with tags
   * @returns Matched Radarr movie data or null
   */
  private async matchPlexMovieToRadarr(
    plexItem: { ratingKey: string; title: string },
    radarrMovies: RadarrMovieWithTags[],
  ): Promise<RadarrMovieWithTags | null> {
    try {
      const metadata = await this.plexServer.getMetadata(plexItem.ratingKey)
      if (!metadata?.Media) {
        this.log.debug('No media information found for Plex movie', {
          ratingKey: plexItem.ratingKey,
          title: plexItem.title,
        })
        return null
      }

      // Extract all file paths from Plex movie
      const plexFilePaths: string[] = []
      for (const media of metadata.Media) {
        for (const part of media.Part || []) {
          if (part.file) {
            plexFilePaths.push(part.file)
          }
        }
      }

      this.log.debug('Matching Plex movie to Radarr', {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexFilePaths,
        radarrMovieCount: radarrMovies.length,
      })

      // Try to match by exact file path
      for (const radarrData of radarrMovies) {
        const movieFilePath = radarrData.movie.movieFile?.path
        if (!movieFilePath) {
          continue
        }

        if (plexFilePaths.includes(movieFilePath)) {
          this.log.debug('Found exact file path match', {
            plexTitle: plexItem.title,
            radarrTitle: radarrData.movie.title,
            filePath: movieFilePath,
            instanceName: radarrData.instanceName,
            tags: radarrData.tags,
          })
          return radarrData
        }
      }

      this.log.debug('No Radarr match found for Plex movie', {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexFilePaths,
      })
      return null
    } catch (error) {
      this.log.error('Error matching Plex movie to Radarr:', error)
      return null
    }
  }

  /**
   * Matches a Plex series to a Sonarr series based on folder paths
   *
   * @param plexItem - The Plex series item
   * @param sonarrSeries - Array of Sonarr series with tags
   * @returns Matched Sonarr series data or null
   */
  private async matchPlexSeriesToSonarr(
    plexItem: { ratingKey: string; title: string },
    sonarrSeries: SonarrSeriesWithTags[],
  ): Promise<SonarrSeriesWithTags | null> {
    try {
      const metadata = await this.plexServer.getMetadata(plexItem.ratingKey)
      if (!metadata) {
        this.log.debug('No metadata found for Plex series', {
          ratingKey: plexItem.ratingKey,
          title: plexItem.title,
        })
        return null
      }

      const plexLocation = metadata.Location?.[0]?.path

      this.log.debug('Matching Plex series to Sonarr', {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexLocation,
        sonarrSeriesCount: sonarrSeries.length,
      })

      // Try to match by root folder
      if (plexLocation) {
        for (const sonarrData of sonarrSeries) {
          if (
            sonarrData.rootFolder &&
            plexLocation.startsWith(sonarrData.rootFolder)
          ) {
            this.log.debug('Found root folder match', {
              plexTitle: plexItem.title,
              sonarrTitle: sonarrData.series.title,
              plexLocation,
              sonarrRootFolder: sonarrData.rootFolder,
              instanceName: sonarrData.instanceName,
              tags: sonarrData.tags,
            })
            return {
              instanceId: sonarrData.instanceId,
              instanceName: sonarrData.instanceName,
              series: sonarrData.series,
              tags: sonarrData.tags,
            }
          }
        }
      }

      // Try to match by exact folder path
      if (plexLocation) {
        for (const sonarrData of sonarrSeries) {
          if (plexLocation === sonarrData.series.path) {
            this.log.debug('Found exact folder path match', {
              plexTitle: plexItem.title,
              sonarrTitle: sonarrData.series.title,
              plexLocation,
              sonarrSeriesPath: sonarrData.series.path,
              instanceName: sonarrData.instanceName,
              tags: sonarrData.tags,
            })
            return {
              instanceId: sonarrData.instanceId,
              instanceName: sonarrData.instanceName,
              series: sonarrData.series,
              tags: sonarrData.tags,
            }
          }
        }
      }

      // Try to match by folder name
      if (plexLocation) {
        for (const sonarrData of sonarrSeries) {
          const sonarrFolderName = sonarrData.series.path?.split('/').pop()
          if (sonarrFolderName && plexLocation.includes(sonarrFolderName)) {
            this.log.debug('Found folder name match', {
              plexTitle: plexItem.title,
              sonarrTitle: sonarrData.series.title,
              plexLocation,
              sonarrFolderName,
              instanceName: sonarrData.instanceName,
              tags: sonarrData.tags,
            })
            return {
              instanceId: sonarrData.instanceId,
              instanceName: sonarrData.instanceName,
              series: sonarrData.series,
              tags: sonarrData.tags,
            }
          }
        }
      }

      // Log available paths for debugging
      try {
        this.log.debug('No match found with available strategies', {
          plexTitle: plexItem.title,
          plexLocation,
          availableSonarrPaths: sonarrSeries.map((s) => ({
            instanceName: s.instanceName,
            seriesPath: s.series.path,
            rootFolder: s.rootFolder,
          })),
        })
      } catch (error) {
        this.log.debug('Error during folder matching fallback:', error)
      }

      this.log.debug('No Sonarr match found for Plex series', {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexLocation,
      })
      return null
    } catch (error) {
      this.log.error('Error matching Plex series to Sonarr:', error)
      return null
    }
  }

  /**
   * Syncs tags from Radarr/Sonarr to Plex labels
   *
   * @param plexItems - Array of Plex content items to process
   * @returns Sync results
   */
  private async syncTagsToPlexItems(
    plexItems: PlexContentItems[],
  ): Promise<{ processed: number; updated: number; failed: number }> {
    if (!this.config.tagSync.enabled) {
      return { processed: 0, updated: 0, failed: 0 }
    }

    const result = { processed: 0, updated: 0, failed: 0 }

    try {
      this.log.info('Starting tag sync from Radarr/Sonarr to Plex labels')

      // Fetch all content from Radarr/Sonarr with tags
      const [radarrMovies, sonarrSeries] = await Promise.all([
        this.fetchAllRadarrMovies(),
        this.fetchAllSonarrSeries(),
      ])

      this.log.debug('Fetched *arr content for tag sync', {
        radarrMovieCount: radarrMovies.length,
        sonarrSeriesCount: sonarrSeries.length,
      })

      // Process each Plex content item
      for (const plexContentItem of plexItems) {
        const { content, plexItems: items } = plexContentItem

        for (const plexItem of items) {
          try {
            result.processed++

            let matchedTags: string[] = []
            let instanceName = ''

            if (content.type === 'movie') {
              const match = await this.matchPlexMovieToRadarr(
                plexItem,
                radarrMovies,
              )
              if (match) {
                matchedTags = match.tags
                instanceName = match.instanceName
              }
            } else if (content.type === 'show') {
              const match = await this.matchPlexSeriesToSonarr(
                plexItem,
                sonarrSeries,
              )
              if (match) {
                matchedTags = match.tags
                instanceName = match.instanceName
              }
            }

            if (matchedTags.length === 0) {
              this.log.debug('No tags found for Plex item', {
                ratingKey: plexItem.ratingKey,
                title: plexItem.title,
                contentType: content.type,
              })
              continue
            }

            // Apply tags as labels to Plex item
            const success = await this.applyTagLabelsToPlexItem(
              plexItem.ratingKey,
              matchedTags,
              instanceName,
            )

            if (success) {
              result.updated++
              this.log.debug('Successfully applied tag labels to Plex item', {
                ratingKey: plexItem.ratingKey,
                title: plexItem.title,
                tags: matchedTags,
                instanceName,
              })
            } else {
              result.failed++
            }
          } catch (error) {
            this.log.error(
              `Error processing tag sync for Plex item ${plexItem.ratingKey}:`,
              error,
            )
            result.failed++
          }
        }
      }

      this.log.info('Completed tag sync to Plex labels', result)
      return result
    } catch (error) {
      this.log.error('Error during tag sync to Plex labels:', error)
      throw error
    }
  }

  /**
   * Applies tag labels to a Plex item
   *
   * @param ratingKey - The Plex rating key
   * @param tags - Array of tags to apply
   * @param instanceName - The *arr instance name
   * @returns True if successful
   */
  private async applyTagLabelsToPlexItem(
    ratingKey: string,
    tags: string[],
    instanceName: string,
  ): Promise<boolean> {
    try {
      // Get current labels
      const metadata = await this.plexServer.getMetadata(ratingKey)
      const currentLabels = metadata?.Label?.map((label) => label.tag) || []

      // Filter out tags that are managed by user tagging system
      const filteredTags = tags.filter(
        (tag) => !this.isUserTaggingSystemTag(tag),
      )

      if (filteredTags.length === 0) {
        this.log.debug(
          'All tags filtered out (managed by user tagging system)',
          {
            ratingKey,
            originalTags: tags,
            instanceName,
          },
        )
        return true
      }

      // Create tag labels with app prefix
      const tagLabels = filteredTags.map(
        (tag) => `${this.config.labelPrefix}:${tag}`,
      )

      // Preserve existing non-app labels and user-specific labels
      const preservedLabels = currentLabels.filter(
        (label) =>
          !this.isAppUserLabel(label) || this.isUserSpecificLabel(label),
      )

      // Remove existing tag labels (non-user-specific app labels)
      const existingTagLabels = currentLabels.filter(
        (label) =>
          this.isAppUserLabel(label) && !this.isUserSpecificLabel(label),
      )

      // Combine preserved labels with new tag labels
      const finalLabels = [...new Set([...preservedLabels, ...tagLabels])]

      this.log.debug('Applying tag labels to Plex item', {
        ratingKey,
        currentLabels,
        tagLabels,
        preservedLabels,
        removedTagLabels: existingTagLabels,
        finalLabels,
        instanceName,
      })

      // Update labels in Plex
      const success = await this.plexServer.updateLabels(ratingKey, finalLabels)

      if (success) {
        this.log.debug('Successfully applied tag labels', {
          ratingKey,
          appliedTags: tags,
          instanceName,
        })
      } else {
        this.log.warn('Failed to apply tag labels', {
          ratingKey,
          tags,
          instanceName,
        })
      }

      return success
    } catch (error) {
      this.log.error('Error applying tag labels to Plex item:', error)
      return false
    }
  }

  /**
   * Synchronizes labels for content when a webhook is received
   * This is the main entry point for real-time label updates
   *
   * @param webhook - The webhook payload from Sonarr/Radarr
   * @returns Promise resolving to true if sync was successful, false otherwise
   */
  async syncLabelsOnWebhook(webhook: WebhookPayload): Promise<boolean> {
    if (!this.config.enabled) {
      this.log.debug('Plex label sync is disabled, skipping webhook processing')
      return false
    }

    try {
      this.log.info('Processing webhook for label sync', {
        eventType: 'eventType' in webhook ? webhook.eventType : 'Unknown',
        instanceName: webhook.instanceName,
      })

      // Extract content GUID from webhook
      const contentGuid = this.extractContentGuidFromWebhook(webhook)
      if (!contentGuid) {
        this.log.warn('Unable to extract content GUID from webhook', {
          webhook,
        })
        return false
      }

      // Extract tag data from webhook if tag sync is enabled
      const webhookTags = this.extractTagsFromWebhook(webhook)

      this.log.debug('Extracted content data from webhook', {
        guid: contentGuid,
        instanceName: webhook.instanceName,
        tags: webhookTags,
        tagSyncEnabled: this.config.tagSync.enabled,
      })

      // Get watchlist items that match this GUID
      const watchlistItems = await this.db.getWatchlistItemsByGuid(contentGuid)
      if (watchlistItems.length === 0) {
        this.log.debug('No users have this content in their watchlist yet', {
          guid: contentGuid,
          note: 'Content may be downloaded before appearing in watchlists - will retry when watchlist syncs',
        })
        return true
      }

      this.log.debug('Found watchlist items for webhook content', {
        guid: contentGuid,
        itemCount: watchlistItems.length,
        items: watchlistItems.map((item) => ({
          id: item.id,
          title: item.title,
          plex_key: item.key,
          user_id: item.user_id,
        })),
      })

      // Process each watchlist item directly using Plex keys
      let allSuccessful = true
      for (const item of watchlistItems) {
        if (!item.key) {
          this.log.warn(
            'Watchlist item missing Plex key, queuing for pending sync',
            {
              itemId: item.id,
              title: item.title,
              webhookTags: webhookTags.length,
            },
          )
          await this.queuePendingLabelSyncByWatchlistId(
            Number(item.id),
            item.title,
            webhookTags,
          )
          continue
        }

        const success = await this.syncLabelForWatchlistItem(item, webhookTags)
        if (!success) {
          allSuccessful = false
        }
      }

      if (allSuccessful) {
        this.log.info('Webhook label sync completed successfully', {
          guid: contentGuid,
          itemCount: watchlistItems.length,
          labelsApplied: true,
        })
      } else {
        this.log.info(
          'Webhook label sync completed with some items queued for retry',
          {
            guid: contentGuid,
            itemCount: watchlistItems.length,
            labelsApplied: false,
            note: 'Content not yet available in Plex, queued for pending sync',
          },
        )
      }

      return allSuccessful
    } catch (error) {
      this.log.error('Error processing webhook for label sync:', error)
      return false
    }
  }

  /**
   * Groups watchlist items by unique content for content-centric processing.
   * Each unique content item (identified by primary GUID) will be processed exactly once.
   *
   * @param watchlistItems - Array of watchlist items from database
   * @returns Array of content items with all associated users
   */
  private async groupWatchlistItemsByContent(
    watchlistItems: Array<{
      id: string | number
      user_id: number
      guids?: string[] | string
      title: string
      type?: string
      key: string | null
    }>,
  ): Promise<ContentWithUsers[]> {
    const contentMap = new Map<string, ContentWithUsers>()

    // Get all unique user IDs to fetch usernames
    const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]
    const allUsers = await this.db.getAllUsers()
    const users = allUsers.filter((user) => userIds.includes(user.id))

    const userMap = new Map(
      users.map((user) => [user.id, user.name || `user_${user.id}`]),
    )

    for (const item of watchlistItems) {
      // Skip items without GUIDs
      if (!item.guids) {
        this.log.debug('Skipping watchlist item without GUIDs', {
          itemId: item.id,
          title: item.title,
        })
        continue
      }

      const parsedGuids = parseGuids(item.guids)
      if (parsedGuids.length === 0) {
        this.log.debug('Skipping watchlist item with empty GUIDs', {
          itemId: item.id,
          title: item.title,
        })
        continue
      }

      // Use the first GUID as the primary identifier for grouping
      const primaryGuid = parsedGuids[0]
      const username = userMap.get(item.user_id) || `user_${item.user_id}`

      const existingContentItem = contentMap.get(primaryGuid)
      let contentItem: ContentWithUsers

      if (!existingContentItem) {
        contentItem = {
          primaryGuid,
          allGuids: parsedGuids,
          title: item.title,
          type: item.type || 'movie',
          plexKey: item.key,
          users: [],
        }
        contentMap.set(primaryGuid, contentItem)
      } else {
        // Merge GUIDs from additional items for the same content
        const newGuids = parsedGuids.filter(
          (guid) => !existingContentItem.allGuids.includes(guid),
        )
        existingContentItem.allGuids.push(...newGuids)

        // Use the first non-null Plex key we find
        if (!existingContentItem.plexKey && item.key) {
          existingContentItem.plexKey = item.key
        }

        contentItem = existingContentItem
      }

      // Add user to this content
      contentItem.users.push({
        user_id: item.user_id,
        username,
        watchlist_id: Number(item.id),
      })
    }

    const result = Array.from(contentMap.values())
    this.log.info(
      `Grouped ${watchlistItems.length} watchlist items into ${result.length} unique content items`,
      {
        watchlistItemCount: watchlistItems.length,
        uniqueContentCount: result.length,
        sampleContent: result.slice(0, 3).map((content) => ({
          primaryGuid: content.primaryGuid,
          title: content.title,
          userCount: content.users.length,
          hasPlexKey: !!content.plexKey,
        })),
      },
    )

    return result
  }

  /**
   * Resolves content items to actual Plex items, filtering out content not yet available.
   *
   * @param contentItems - Array of content items to resolve
   * @returns Array of content items with their corresponding Plex items
   */
  private async resolveContentToPlexItems(
    contentItems: ContentWithUsers[],
  ): Promise<{
    available: PlexContentItems[]
    unavailable: ContentWithUsers[]
  }> {
    const available: PlexContentItems[] = []
    const unavailable: ContentWithUsers[] = []

    for (const content of contentItems) {
      if (!content.plexKey) {
        this.log.debug(
          'Content item missing Plex key, marking as unavailable',
          {
            primaryGuid: content.primaryGuid,
            title: content.title,
          },
        )
        unavailable.push(content)
        continue
      }

      try {
        // Construct full GUID and search for the content in Plex
        const contentType = content.type || 'movie'
        const fullGuid =
          contentType === 'show'
            ? `plex://show/${content.plexKey}`
            : `plex://movie/${content.plexKey}`

        this.log.debug('Resolving content to Plex items', {
          primaryGuid: content.primaryGuid,
          title: content.title,
          plexKey: content.plexKey,
          fullGuid,
          contentType,
        })

        const plexItems = await this.plexServer.searchByGuid(fullGuid)

        if (plexItems.length === 0) {
          this.log.debug('Content not found in Plex library', {
            primaryGuid: content.primaryGuid,
            title: content.title,
            fullGuid,
          })
          unavailable.push(content)
        } else {
          this.log.debug('Found content in Plex library', {
            primaryGuid: content.primaryGuid,
            title: content.title,
            plexItemCount: plexItems.length,
            ratingKeys: plexItems.map((item) => item.ratingKey),
          })
          available.push({
            content,
            plexItems: plexItems.map((item) => ({
              ratingKey: item.ratingKey,
              title: item.title,
            })),
          })
        }
      } catch (error) {
        this.log.error('Error resolving content to Plex items', {
          primaryGuid: content.primaryGuid,
          title: content.title,
          error,
        })
        unavailable.push(content)
      }
    }

    this.log.debug('Plex library scan completed', {
      totalContent: contentItems.length,
      foundInPlex: available.length,
      waitingForDownload: unavailable.length,
    })

    return { available, unavailable }
  }

  /**
   * Performs complete label reconciliation for a single content item.
   * Determines the desired label state and applies both additions and removals.
   *
   * @param contentItems - The content with its Plex items
   * @returns Reconciliation result
   */
  private async reconcileLabelsForContent(
    contentItems: PlexContentItems,
    radarrMoviesWithTags: RadarrMovieWithTags[] = [],
    sonarrSeriesWithTags: SonarrSeriesWithTags[] = [],
  ): Promise<LabelReconciliationResult> {
    const { content, plexItems } = contentItems
    let totalLabelsAdded = 0
    let totalLabelsRemoved = 0

    try {
      // Calculate desired user labels based on complete user set
      const desiredUserLabels = content.users.map(
        (user) => `${this.config.labelPrefix}:${user.username}`,
      )

      // Calculate desired tag labels if tag sync is enabled
      const desiredTagLabels: string[] = []
      let tagInstanceName = ''

      if (this.config.tagSync.enabled && plexItems.length > 0) {
        // Use the first Plex item for tag matching (they all represent the same content)
        const plexItem = plexItems[0]

        if (content.type === 'movie') {
          const match = await this.matchPlexMovieToRadarr(
            plexItem,
            radarrMoviesWithTags,
          )
          if (match) {
            const filteredTags = match.tags.filter(
              (tag) => !this.isUserTaggingSystemTag(tag),
            )
            desiredTagLabels.push(
              ...filteredTags.map((tag) => `${this.config.labelPrefix}:${tag}`),
            )
            tagInstanceName = match.instanceName
          }
        } else if (content.type === 'show') {
          const match = await this.matchPlexSeriesToSonarr(
            plexItem,
            sonarrSeriesWithTags,
          )
          if (match) {
            const filteredTags = match.tags.filter(
              (tag) => !this.isUserTaggingSystemTag(tag),
            )
            desiredTagLabels.push(
              ...filteredTags.map((tag) => `${this.config.labelPrefix}:${tag}`),
            )
            tagInstanceName = match.instanceName
          }
        }
      }

      // Combine all desired labels (user + tag labels)
      const allDesiredLabels = [...desiredUserLabels, ...desiredTagLabels]

      this.log.debug('Starting consolidated label reconciliation for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
        userCount: content.users.length,
        desiredUserLabels,
        desiredTagLabels,
        allDesiredLabels,
        tagInstanceName,
        plexItemCount: plexItems.length,
      })

      // Process each Plex item (handles multiple versions of same content)
      for (const plexItem of plexItems) {
        const result = await this.reconcileLabelsForSingleItem(
          plexItem.ratingKey,
          allDesiredLabels,
          desiredUserLabels,
          desiredTagLabels,
          content,
        )

        totalLabelsAdded += result.labelsAdded
        totalLabelsRemoved += result.labelsRemoved

        if (!result.success) {
          this.log.warn('Failed to reconcile labels for Plex item', {
            ratingKey: plexItem.ratingKey,
            title: plexItem.title,
            error: result.error,
          })
        }
      }

      // Update tracking table to match final state (user + tag labels)
      await this.updateTrackingForContent(
        content,
        plexItems,
        allDesiredLabels,
        desiredUserLabels,
        desiredTagLabels,
      )

      this.log.debug('Completed label reconciliation for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
        labelsAdded: totalLabelsAdded,
        labelsRemoved: totalLabelsRemoved,
      })

      return {
        success: true,
        labelsAdded: totalLabelsAdded,
        labelsRemoved: totalLabelsRemoved,
      }
    } catch (error) {
      this.log.error('Error during label reconciliation for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
        error,
      })

      return {
        success: false,
        labelsAdded: totalLabelsAdded,
        labelsRemoved: totalLabelsRemoved,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Reconciles labels for a single Plex item by comparing current vs desired state.
   *
   * @param ratingKey - The Plex rating key
   * @param desiredUserLabels - Array of user labels that should exist
   * @param content - The content being processed (for logging)
   * @returns Reconciliation result for this item
   */
  private async reconcileLabelsForSingleItem(
    ratingKey: string,
    allDesiredLabels: string[],
    desiredUserLabels: string[],
    desiredTagLabels: string[],
    content: ContentWithUsers,
  ): Promise<LabelReconciliationResult> {
    try {
      // Get current labels from Plex
      const metadata = await this.plexServer.getMetadata(ratingKey)
      const currentLabels = metadata?.Label?.map((label) => label.tag) || []

      // Separate app-managed labels (user + tag) from other labels
      const currentAppLabels = currentLabels.filter((label) =>
        this.isAppUserLabel(label),
      )
      const nonAppLabels = currentLabels.filter(
        (label) => !this.isAppUserLabel(label),
      )

      // Calculate label changes needed for ALL app-managed labels
      const labelsToAdd = allDesiredLabels.filter(
        (label) => !currentAppLabels.includes(label),
      )
      const labelsToRemove = currentAppLabels.filter(
        (label) => !allDesiredLabels.includes(label),
      )

      // Handle removed labels based on configuration
      let finalLabels: string[]
      let specialRemovedLabel: string | null = null

      if (this.removedLabelMode === 'keep') {
        // Keep all existing labels and add new ones
        finalLabels = [...new Set([...currentLabels, ...labelsToAdd])]
      } else if (this.removedLabelMode === 'special-label') {
        // Remove app labels but add special "removed" label if needed
        if (labelsToRemove.length > 0) {
          specialRemovedLabel = await this.getRemovedLabel(content.title)
          finalLabels = [
            ...new Set([
              ...nonAppLabels,
              ...allDesiredLabels,
              specialRemovedLabel,
            ]),
          ]
        } else {
          finalLabels = [...new Set([...nonAppLabels, ...allDesiredLabels])]
        }
      } else {
        // Default 'remove' mode - clean removal of obsolete labels
        finalLabels = [...new Set([...nonAppLabels, ...allDesiredLabels])]
      }

      // Remove any existing "removed" labels when users are re-adding content
      if (allDesiredLabels.length > 0) {
        const removedLabels = finalLabels.filter((label) =>
          label.toLowerCase().startsWith(this.removedLabelPrefix.toLowerCase()),
        )
        if (removedLabels.length > 0 && !specialRemovedLabel) {
          finalLabels = finalLabels.filter(
            (label) => !removedLabels.includes(label),
          )
        }
      }

      this.log.debug('Consolidated label reconciliation plan for Plex item', {
        ratingKey,
        contentTitle: content.title,
        currentLabels,
        currentAppLabels,
        desiredUserLabels,
        desiredTagLabels,
        allDesiredLabels,
        labelsToAdd,
        labelsToRemove,
        finalLabels,
        mode: this.removedLabelMode,
        specialRemovedLabel,
      })

      // Apply the updated labels to Plex
      const success = await this.plexServer.updateLabels(ratingKey, finalLabels)

      if (success) {
        this.log.debug('Successfully updated labels for Plex item', {
          ratingKey,
          contentTitle: content.title,
          labelsAdded: labelsToAdd.length,
          labelsRemoved: labelsToRemove.length,
        })

        return {
          success: true,
          labelsAdded: labelsToAdd.length,
          labelsRemoved: labelsToRemove.length,
        }
      }

      this.log.warn('Failed to update labels for Plex item', {
        ratingKey,
        contentTitle: content.title,
      })

      return {
        success: false,
        labelsAdded: 0,
        labelsRemoved: 0,
        error: 'Failed to update labels in Plex',
      }
    } catch (error) {
      this.log.error('Error reconciling labels for Plex item', {
        ratingKey,
        contentTitle: content.title,
        error,
      })

      return {
        success: false,
        labelsAdded: 0,
        labelsRemoved: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Updates the tracking table to reflect the final state after label reconciliation.
   * Removes obsolete tracking records and adds new ones as needed.
   *
   * @param content - The content being processed
   * @param plexItems - The Plex items for this content
   * @param finalUserLabels - The final set of user labels that should be tracked
   */
  private async updateTrackingForContent(
    content: ContentWithUsers,
    plexItems: Array<{ ratingKey: string; title: string }>,
    allFinalLabels: string[],
    finalUserLabels: string[],
    finalTagLabels: string[],
  ): Promise<void> {
    try {
      this.log.debug('Updating tracking table for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
        userCount: content.users.length,
        plexItemCount: plexItems.length,
        finalUserLabels,
      })

      // Process each Plex item
      for (const plexItem of plexItems) {
        // Get current tracking records for this rating key
        const currentTracking = await this.db.getTrackedLabelsForRatingKey(
          plexItem.ratingKey,
        )

        // Determine which tracking records should exist
        const desiredTracking = new Set<string>()

        // Track user labels with their specific watchlist IDs
        for (const user of content.users) {
          const userLabel = `${this.config.labelPrefix}:${user.username}`
          if (finalUserLabels.includes(userLabel)) {
            desiredTracking.add(
              `${user.watchlist_id}:${plexItem.ratingKey}:${userLabel}`,
            )
          }
        }

        // Track tag labels using any valid watchlist ID (they're content-specific, not user-specific)
        if (finalTagLabels.length > 0 && content.users.length > 0) {
          const representativeWatchlistId = content.users[0].watchlist_id
          for (const tagLabel of finalTagLabels) {
            if (allFinalLabels.includes(tagLabel)) {
              desiredTracking.add(
                `${representativeWatchlistId}:${plexItem.ratingKey}:${tagLabel}`,
              )
            }
          }
        }

        // Remove obsolete tracking records
        for (const tracking of currentTracking) {
          // Check each label in the tracking record
          for (const label of tracking.labels_applied) {
            const trackingKey = `${tracking.content_key}:${tracking.user_id}:${tracking.plex_rating_key}:${label}`
            if (!desiredTracking.has(trackingKey)) {
              await this.db.untrackPlexLabel(
                tracking.content_key,
                tracking.user_id,
                tracking.plex_rating_key,
                label,
              )
              this.log.debug('Removed obsolete tracking record', {
                contentKey: tracking.content_key,
                userId: tracking.user_id,
                ratingKey: tracking.plex_rating_key,
                label: label,
              })
            }
          }
        }

        // Update tracking records using efficient array-based approach
        for (const user of content.users) {
          const userLabel = `${this.config.labelPrefix}:${user.username}`

          // Validate user data before processing
          if (!user.watchlist_id || typeof user.watchlist_id !== 'number') {
            this.log.warn('Invalid watchlist_id for user, skipping tracking', {
              userId: user.user_id,
              username: user.username,
              watchlistId: user.watchlist_id,
              ratingKey: plexItem.ratingKey,
            })
            continue
          }

          // Build complete label array for this user (user label + all tag labels)
          const userLabelsForContent: string[] = []

          // Add user label if it should be applied
          if (finalUserLabels.includes(userLabel)) {
            userLabelsForContent.push(userLabel)
          }

          // Add all tag labels (tags apply to all users with this content)
          userLabelsForContent.push(...finalTagLabels)

          // Only track if there are labels to track
          if (userLabelsForContent.length > 0) {
            try {
              await this.db.trackPlexLabels(
                content.primaryGuid,
                user.user_id,
                plexItem.ratingKey,
                userLabelsForContent,
              )
              this.log.debug('Updated complete label tracking record', {
                watchlistId: user.watchlist_id,
                ratingKey: plexItem.ratingKey,
                labelCount: userLabelsForContent.length,
                labels: userLabelsForContent,
              })
            } catch (error) {
              this.log.error('Failed to track labels in database', {
                userId: user.user_id,
                username: user.username,
                watchlistId: user.watchlist_id,
                ratingKey: plexItem.ratingKey,
                labels: userLabelsForContent,
                labelCount: userLabelsForContent.length,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
        }
      }

      this.log.debug('Completed tracking table update for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
      })
    } catch (error) {
      this.log.error('Error updating tracking table for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
        error,
      })
      // Don't throw - tracking failures shouldn't prevent label sync
    }
  }

  /**
   * Queues unavailable content items for pending sync.
   *
   * @param unavailableContent - Content items not yet available in Plex
   */
  private async queueUnavailableContent(
    unavailableContent: ContentWithUsers[],
  ): Promise<void> {
    let queuedCount = 0

    for (const content of unavailableContent) {
      for (const user of content.users) {
        try {
          await this.queuePendingLabelSyncByWatchlistId(
            user.watchlist_id,
            content.title,
          )
          queuedCount++
        } catch (error) {
          this.log.error('Failed to queue pending label sync', {
            watchlistId: user.watchlist_id,
            title: content.title,
            error,
          })
        }
      }
    }

    this.log.info('Queued unavailable content for pending sync', {
      contentCount: unavailableContent.length,
      queuedWatchlistItems: queuedCount,
    })
  }

  /**
   * Synchronizes all labels for all content in batch mode using content-centric approach.
   * Each unique content item is processed exactly once with complete user set visibility.
   *
   * @param progressCallback - Optional callback to report progress for SSE
   * @returns Promise resolving to sync results
   */
  async syncAllLabels(
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<SyncResult> {
    this.log.info('Starting Plex label synchronization')

    if (!this.config.enabled) {
      this.log.warn('Plex label sync is disabled, skipping', {
        enabled: this.config.enabled,
      })
      return { processed: 0, updated: 0, failed: 0, pending: 0 }
    }

    const result: SyncResult = {
      processed: 0,
      updated: 0,
      failed: 0,
      pending: 0,
    }

    try {
      this.log.debug('Beginning label sync process')
      progressCallback?.(0, 'Starting Plex label synchronization...')

      // Step 1: Get all active watchlist items from database
      this.log.debug('Fetching watchlist items from database...')
      const [movieItems, showItems] = await Promise.all([
        this.db.getAllMovieWatchlistItems(),
        this.db.getAllShowWatchlistItems(),
      ])
      const watchlistItems = [...movieItems, ...showItems]

      this.log.info(
        `Database query results: Found ${movieItems.length} movies and ${showItems.length} shows (${watchlistItems.length} total items)`,
        {
          movieItemsCount: movieItems.length,
          showItemsCount: showItems.length,
          totalWatchlistItems: watchlistItems.length,
        },
      )

      if (watchlistItems.length === 0) {
        this.log.warn(
          'No watchlist items found in database - this might indicate an empty watchlist table',
        )
        progressCallback?.(100, 'No content found to label')
        return result
      }

      // Step 2: Fetch tag data from Radarr/Sonarr instances if tag sync is enabled
      let radarrMoviesWithTags: RadarrMovieWithTags[] = []
      let sonarrSeriesWithTags: SonarrSeriesWithTags[] = []

      if (this.config.tagSync.enabled) {
        progressCallback?.(
          10,
          'Fetching tag data from Radarr/Sonarr instances...',
        )
        this.log.debug(
          'Fetching tag data from *arr instances for consolidated processing',
        )

        const [radarrData, sonarrData] = await Promise.all([
          this.fetchAllRadarrMovies(),
          this.fetchAllSonarrSeries(),
        ])

        radarrMoviesWithTags = radarrData
        sonarrSeriesWithTags = sonarrData

        this.log.info('Fetched tag data from *arr instances', {
          radarrMoviesCount: radarrMoviesWithTags.length,
          sonarrSeriesCount: sonarrSeriesWithTags.length,
        })
      }

      progressCallback?.(
        15,
        `Grouping ${watchlistItems.length} watchlist items by content...`,
      )

      // Step 3: Group watchlist items by unique content (content-centric approach)
      const contentItems =
        await this.groupWatchlistItemsByContent(watchlistItems)

      if (contentItems.length === 0) {
        this.log.warn('No valid content items found after grouping')
        progressCallback?.(100, 'No valid content found to process')
        return result
      }

      progressCallback?.(
        25,
        `Resolving ${contentItems.length} unique content items to Plex items...`,
      )

      // Step 4: Resolve content items to actual Plex items
      const { available, unavailable } =
        await this.resolveContentToPlexItems(contentItems)

      // Step 5: Queue unavailable content for pending sync
      if (unavailable.length > 0) {
        await this.queueUnavailableContent(unavailable)
        result.pending = unavailable.reduce(
          (sum, content) => sum + content.users.length,
          0,
        )
      }

      if (available.length === 0) {
        this.log.warn('No content available in Plex for processing')
        progressCallback?.(
          100,
          'No content available in Plex - all items queued for pending sync',
        )
        return result
      }

      progressCallback?.(
        40,
        `Processing ${available.length} content items with content-centric reconciliation...`,
      )

      // Step 6: Process available content
      const concurrencyLimit = this.config.concurrencyLimit || 5
      this.log.debug(`Processing ${available.length} content items`)

      const limit = pLimit(concurrencyLimit)
      let processedContentCount = 0

      const contentProcessingResults = await Promise.allSettled(
        available.map((contentItems) =>
          limit(async () => {
            try {
              processedContentCount++

              // Report progress during processing
              const processProgress =
                40 + Math.floor((processedContentCount / available.length) * 50)
              progressCallback?.(
                processProgress,
                `Processing content ${processedContentCount}/${available.length}`,
              )

              // Perform complete label reconciliation for this content (user + tag labels)
              const reconciliationResult = await this.reconcileLabelsForContent(
                contentItems,
                radarrMoviesWithTags,
                sonarrSeriesWithTags,
              )

              const contentResult = {
                processed: 1, // One unique content item processed
                updated: reconciliationResult.success ? 1 : 0,
                failed: reconciliationResult.success ? 0 : 1,
                pending: 0,
                labelsAdded: reconciliationResult.labelsAdded,
                labelsRemoved: reconciliationResult.labelsRemoved,
              }

              this.log.debug('Content-centric processing completed', {
                primaryGuid: contentItems.content.primaryGuid,
                title: contentItems.content.title,
                userCount: contentItems.content.users.length,
                plexItemCount: contentItems.plexItems.length,
                success: reconciliationResult.success,
                labelsAdded: reconciliationResult.labelsAdded,
                labelsRemoved: reconciliationResult.labelsRemoved,
              })

              return contentResult
            } catch (error) {
              this.log.error(
                `Error processing content ${contentItems.content.primaryGuid} (${contentItems.content.title}):`,
                error,
              )
              return {
                processed: 1,
                updated: 0,
                failed: 1,
                pending: 0,
                labelsAdded: 0,
                labelsRemoved: 0,
              }
            }
          }),
        ),
      )

      // Step 6: Aggregate results
      let totalLabelsAdded = 0
      let totalLabelsRemoved = 0

      for (const promiseResult of contentProcessingResults) {
        if (promiseResult.status === 'fulfilled') {
          const contentResult = promiseResult.value
          result.processed += contentResult.processed
          result.updated += contentResult.updated
          result.failed += contentResult.failed
          result.pending += contentResult.pending
          totalLabelsAdded += contentResult.labelsAdded || 0
          totalLabelsRemoved += contentResult.labelsRemoved || 0
        } else {
          this.log.error('Error processing content item:', promiseResult.reason)
          result.failed++
        }
      }

      // Get accurate pending count from database
      const pendingSyncs = await this.db.getPendingLabelSyncs()
      result.pending = pendingSyncs.length

      this.log.info(
        `Processed ${result.processed} content items: ${result.updated} updated, ${result.failed} failed, ${result.pending} pending`,
        {
          totalLabelsAdded,
          totalLabelsRemoved,
        },
      )

      // Step 7: Handle orphaned label cleanup if enabled
      let cleanupMessage = ''
      if (this.config.cleanupOrphanedLabels) {
        try {
          progressCallback?.(95, 'Cleaning up orphaned Plex labels...')
          const cleanupResult = await this.cleanupOrphanedPlexLabels(
            radarrMoviesWithTags,
            sonarrSeriesWithTags,
          )
          if (cleanupResult.removed > 0 || cleanupResult.failed > 0) {
            cleanupMessage = `, cleaned up ${cleanupResult.removed} orphaned labels (${cleanupResult.failed} failed)`
            this.log.info(
              'Completed orphaned Plex label cleanup',
              cleanupResult,
            )
          }
        } catch (cleanupError) {
          this.log.error('Error during orphaned label cleanup:', cleanupError)
          cleanupMessage = ', orphaned cleanup failed'
        }
      }

      this.log.info('Plex label synchronization completed', {
        ...result,
        totalLabelsAdded,
        totalLabelsRemoved,
      })

      progressCallback?.(
        100,
        `Completed consolidated Plex label sync (user + tags): ${result.updated} content items updated, ${result.failed} failed, ${result.pending} pending (${totalLabelsAdded} labels added, ${totalLabelsRemoved} removed)${cleanupMessage}`,
      )

      return result
    } catch (error) {
      this.log.error(
        'Error in content-centric batch label synchronization:',
        error,
      )
      throw error
    }
  }

  /**
   * @deprecated This method is no longer used as we now use direct Plex key access
   * instead of GUID-based searching for much better performance.
   *
   * Finds all Plex items by GUID with exponential backoff retry logic
   * Returns ALL matching items to handle multiple versions (HD, 4K, etc.)
   *
   * @param guid - The content GUID to search for
   * @param maxRetries - Maximum number of retry attempts
   * @returns Promise resolving to array of Plex metadata items
   */
  private async findPlexItemsWithRetry(
    guid: string,
    maxRetries: number,
  ): Promise<Array<{ ratingKey: string; title: string }>> {
    this.log.warn(
      'Using deprecated GUID-based search method. Consider updating to use direct Plex key access.',
      {
        guid,
        maxRetries,
      },
    )

    let retryCount = 0
    let delay = 1000 // Start with 1 second delay

    while (retryCount < maxRetries) {
      try {
        this.log.debug(
          `Searching for content in Plex (attempt ${retryCount + 1}/${maxRetries})`,
          {
            guid,
            delay,
          },
        )

        // Search for ALL items in Plex by GUID
        const searchResults = await this.plexServer.searchByGuid(guid)
        if (searchResults.length > 0) {
          const items = searchResults.map((item) => ({
            ratingKey: item.ratingKey,
            title: item.title,
          }))

          this.log.debug('Found content in Plex', {
            guid,
            itemCount: items.length,
            items: items.map((item) => ({
              ratingKey: item.ratingKey,
              title: item.title,
            })),
          })

          return items
        }

        // If not found, wait before retrying
        if (retryCount < maxRetries - 1) {
          this.log.debug(`Content not found, retrying in ${delay}ms`, { guid })
          await new Promise((resolve) => setTimeout(resolve, delay))
          delay *= 2 // Exponential backoff
        }

        retryCount++
      } catch (error) {
        this.log.error(
          `Error searching for content in Plex (attempt ${retryCount + 1}):`,
          error,
        )
        retryCount++

        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay))
          delay *= 2
        }
      }
    }

    this.log.debug('Content not found in Plex after all retry attempts', {
      guid,
      maxRetries,
    })
    return []
  }

  /**
   * Applies user labels to multiple Plex items while preserving existing labels
   * Handles batch labeling for multiple versions of the same content
   *
   * @param ratingKeys - Array of Plex rating keys to label
   * @param users - Array of users who have this content with watchlist IDs
   * @returns Promise resolving to true if all items were labeled successfully
   */
  private async applyUserLabels(
    ratingKeys: string | string[],
    users: Array<{ user_id: number; username: string; watchlist_id: number }>,
  ): Promise<boolean> {
    // Handle both single rating key and array of rating keys
    const keys = Array.isArray(ratingKeys) ? ratingKeys : [ratingKeys]

    if (keys.length === 0) {
      this.log.warn('No rating keys provided for labeling')
      return false
    }

    this.log.info(
      `Applying labels to ${keys.length} item(s) for ${users.length} user(s)`,
      {
        ratingKeys: keys,
        userCount: users.length,
      },
    )

    let allSuccessful = true

    // Apply labels to each item
    for (const ratingKey of keys) {
      const success = await this.applyLabelsToSingleItem(ratingKey, users)
      if (!success) {
        allSuccessful = false
      }
    }

    return allSuccessful
  }

  /**
   * Applies user labels to a single Plex item while preserving existing labels
   * Also tracks applied labels in the database for cleanup purposes
   *
   * @param ratingKey - The Plex rating key of the item
   * @param users - Array of users who have this content with watchlist IDs
   * @returns Promise resolving to true if successful, false otherwise
   */
  private async applyUserLabelsToSingleItem(
    ratingKey: string,
    users: Array<{ user_id: number; username: string; watchlist_id: number }>,
  ): Promise<boolean> {
    try {
      // Get current item metadata to preserve existing labels
      let existingLabels: string[] = []
      const metadata = await this.plexServer.getMetadata(ratingKey)
      if (metadata?.Label) {
        existingLabels = metadata.Label.map((label) => label.tag)
      }

      // Generate user labels based on configured prefix
      const userLabels = users.map(
        (user) => `${this.config.labelPrefix}:${user.username}`,
      )

      // Clean up any existing "removed" labels when users are re-adding content
      const removedLabels = existingLabels.filter((label) =>
        label.toLowerCase().startsWith(this.removedLabelPrefix.toLowerCase()),
      )

      let cleanedExistingLabels = existingLabels
      if (userLabels.length > 0 && removedLabels.length > 0) {
        // Remove any "removed" labels since we're adding users back
        cleanedExistingLabels = existingLabels.filter(
          (label) => !removedLabels.includes(label),
        )
        this.log.debug('Removing obsolete "removed" labels', {
          ratingKey,
          removedLabels,
        })
      }

      // Handle labels based on configured cleanup mode
      let finalLabels: string[]

      if (this.removedLabelMode === 'keep') {
        // Simply add any missing user labels, don't remove any
        finalLabels = [...new Set([...cleanedExistingLabels, ...userLabels])]

        this.log.debug('Using "keep" mode - preserving all existing labels', {
          ratingKey,
          mode: 'keep',
          existingCount: cleanedExistingLabels.length,
          addingCount: userLabels.length,
        })
      } else if (this.removedLabelMode === 'special-label') {
        // Find which labels are non-user labels that should be preserved
        const nonUserLabels = cleanedExistingLabels.filter(
          (label) => !this.isAppUserLabel(label),
        )

        // Find user labels that exist but are not in the current user list
        const existingUserLabels = cleanedExistingLabels.filter((label) =>
          this.isAppUserLabel(label),
        )
        const removedUserLabels = existingUserLabels.filter(
          (label) => !userLabels.includes(label),
        )

        // If we have labels being removed, add special "removed" label
        if (removedUserLabels.length > 0) {
          const itemName = metadata?.title || 'Unknown'
          const removedLabel = await this.getRemovedLabel(itemName)
          finalLabels = [
            ...new Set([...nonUserLabels, ...userLabels, removedLabel]),
          ]

          this.log.debug('Using "special-label" mode - adding removed label', {
            ratingKey,
            mode: 'special-label',
            removedUserLabels,
            removedLabel,
          })
        } else {
          finalLabels = [...new Set([...nonUserLabels, ...userLabels])]

          this.log.debug('Using "special-label" mode - no users removed', {
            ratingKey,
            mode: 'special-label',
          })
        }
      } else {
        // Default 'remove' mode - filter out any existing user labels and add current ones
        const nonUserLabels = cleanedExistingLabels.filter(
          (label) => !this.isAppUserLabel(label),
        )
        finalLabels = [...new Set([...nonUserLabels, ...userLabels])]

        this.log.debug('Using "remove" mode - replacing user labels', {
          ratingKey,
          mode: 'remove',
          preservedCount: nonUserLabels.length,
          userLabelCount: userLabels.length,
        })
      }

      this.log.debug('Applying labels to Plex item', {
        ratingKey,
        existingLabels,
        userLabels,
        finalLabels,
        mode: this.removedLabelMode,
      })

      // Update the labels in Plex
      const success = await this.plexServer.updateLabels(ratingKey, finalLabels)

      if (success) {
        this.log.debug(`Successfully updated labels for item ${ratingKey}`, {
          labelCount: finalLabels.length,
          userCount: users.length,
        })

        // Track each applied user label in the database for cleanup purposes
        let trackingErrors = 0
        for (const user of users) {
          const userLabel = `${this.config.labelPrefix}:${user.username}`
          try {
            await this.db.trackPlexLabels(
              'unknown-content',
              user.user_id,
              ratingKey,
              [userLabel],
            )
            this.log.debug('Successfully tracked label in database', {
              watchlistId: user.watchlist_id,
              ratingKey,
              label: userLabel,
            })
          } catch (error) {
            this.log.error(
              `Failed to track label in database for watchlist ${user.watchlist_id}:`,
              error,
            )
            trackingErrors++
          }
        }

        if (trackingErrors > 0) {
          this.log.warn(
            `Labels applied to Plex but ${trackingErrors} tracking records failed to save`,
            {
              ratingKey,
              successfulTracks: users.length - trackingErrors,
              failedTracks: trackingErrors,
            },
          )
        }
      } else {
        this.log.warn(`Failed to update labels for item ${ratingKey}`)
      }

      return success
    } catch (error) {
      this.log.error(`Error applying user labels to item ${ratingKey}:`, error)
      return false
    }
  }

  /**
   * Applies both user and webhook tag labels to a single Plex item in one API call
   *
   * @param ratingKey - The Plex rating key of the item
   * @param users - Array of users who have this content with watchlist IDs
   * @param webhookTags - Optional array of tags from webhook payload
   * @param contentType - The content type (movie/show) for proper instance checking
   * @returns Promise resolving to true if successful, false otherwise
   */
  private async applyLabelsToSingleItem(
    ratingKey: string,
    users: Array<{ user_id: number; username: string; watchlist_id: number }>,
    webhookTags?: string[],
    contentType?: string,
  ): Promise<boolean> {
    try {
      // Get current item metadata to preserve existing labels
      let existingLabels: string[] = []
      const metadata = await this.plexServer.getMetadata(ratingKey)
      if (metadata?.Label) {
        existingLabels = metadata.Label.map((label) => label.tag)
      }

      // Generate user labels based on configured prefix
      const userLabels = users.map(
        (user) => `${this.config.labelPrefix}:${user.username}`,
      )

      // Process webhook tag labels if available and tag sync is enabled
      let tagLabels: string[] = []
      if (
        this.config.tagSync.enabled &&
        webhookTags &&
        webhookTags.length > 0
      ) {
        const isMovie = contentType === 'movie'
        const isShow = contentType === 'show'

        // Check if tag sync is enabled for this content type
        const shouldSyncTags =
          (isMovie && this.config.tagSync.syncRadarrTags) ||
          (isShow && this.config.tagSync.syncSonarrTags) ||
          (!isMovie && !isShow) // Default to true if content type unclear

        if (shouldSyncTags) {
          // Filter out tags managed by user tagging system
          const filteredTags = webhookTags.filter(
            (tag) => !this.isUserTaggingSystemTag(tag),
          )

          // Create tag labels with app prefix
          tagLabels = filteredTags.map(
            (tag) => `${this.config.labelPrefix}:${tag}`,
          )

          this.log.debug('Processed webhook tags for label sync', {
            ratingKey,
            contentType,
            originalTags: webhookTags,
            filteredTags,
            tagLabels,
          })
        } else {
          this.log.debug(
            'Tag sync disabled for content type, skipping webhook tags',
            {
              ratingKey,
              contentType,
              tagSyncEnabled: this.config.tagSync.enabled,
              syncRadarrTags: this.config.tagSync.syncRadarrTags,
              syncSonarrTags: this.config.tagSync.syncSonarrTags,
            },
          )
        }
      }

      // Clean up any existing "removed" labels when users are re-adding content
      const removedLabels = existingLabels.filter((label) =>
        label.toLowerCase().startsWith(this.removedLabelPrefix.toLowerCase()),
      )

      let cleanedExistingLabels = existingLabels
      if (userLabels.length > 0 && removedLabels.length > 0) {
        // Remove any "removed" labels since we're adding users back
        cleanedExistingLabels = existingLabels.filter(
          (label) => !removedLabels.includes(label),
        )
        this.log.debug('Removing obsolete "removed" labels', {
          ratingKey,
          removedLabels,
        })
      }

      // Handle labels based on configured cleanup mode
      let finalLabels: string[]

      if (this.removedLabelMode === 'keep') {
        // Get all tracked labels for this rating key from the tracking table
        const trackedLabels =
          await this.db.getTrackedLabelsForRatingKey(ratingKey)
        const allTrackedLabels = new Set<string>()

        // Collect all labels from all tracking records
        for (const tracking of trackedLabels) {
          for (const label of tracking.labels_applied) {
            allTrackedLabels.add(label)
          }
        }

        // Combine tracked labels with new user/tag labels
        finalLabels = [
          ...new Set([
            ...Array.from(allTrackedLabels),
            ...userLabels,
            ...tagLabels,
            // Also preserve any non-app labels from Plex
            ...cleanedExistingLabels.filter(
              (label) => !this.isAppUserLabel(label),
            ),
          ]),
        ]

        this.log.debug('Using "keep" mode - preserving all existing labels', {
          ratingKey,
          mode: 'keep',
          existingCount: cleanedExistingLabels.length,
          addingUserCount: userLabels.length,
          addingTagCount: tagLabels.length,
        })
      } else if (this.removedLabelMode === 'special-label') {
        // Get all tracked labels for this rating key from the tracking table
        const trackedLabels =
          await this.db.getTrackedLabelsForRatingKey(ratingKey)
        const allTrackedUserLabels = new Set<string>()

        // Collect all tracked user labels from tracking records
        for (const tracking of trackedLabels) {
          for (const label of tracking.labels_applied) {
            if (this.isAppUserLabel(label)) {
              allTrackedUserLabels.add(label)
            }
          }
        }

        // Find which labels are non-user, non-tag labels that should be preserved
        const nonAppLabels = cleanedExistingLabels.filter(
          (label) => !this.isAppUserLabel(label) && !this.isAppTagLabel(label),
        )

        // In special-label mode, preserve all tracked user labels and add new ones
        // Remove any existing "removed" labels since someone is adding content
        const existingRemovedLabels = cleanedExistingLabels.filter((label) =>
          label.toLowerCase().startsWith(this.removedLabelPrefix.toLowerCase()),
        )

        finalLabels = [
          ...new Set([
            ...nonAppLabels.filter(
              (label) =>
                !label
                  .toLowerCase()
                  .startsWith(this.removedLabelPrefix.toLowerCase()),
            ),
            ...Array.from(allTrackedUserLabels),
            ...userLabels,
            ...tagLabels,
          ]),
        ]

        this.log.debug(
          'Using "special-label" mode - preserving tracked labels',
          {
            ratingKey,
            mode: 'special-label',
            allTrackedUserLabels: Array.from(allTrackedUserLabels),
            removedExistingRemovedLabels: existingRemovedLabels,
            addingUserLabels: userLabels,
          },
        )
      } else {
        // Default 'remove' mode - filter out existing app labels and add current ones
        const nonAppLabels = cleanedExistingLabels.filter(
          (label) => !this.isAppUserLabel(label) && !this.isAppTagLabel(label),
        )
        finalLabels = [
          ...new Set([...nonAppLabels, ...userLabels, ...tagLabels]),
        ]

        this.log.debug('Using "remove" mode - replacing app labels', {
          ratingKey,
          mode: 'remove',
          preservedCount: nonAppLabels.length,
          userLabelCount: userLabels.length,
          tagLabelCount: tagLabels.length,
        })
      }

      this.log.debug('Applying combined labels to Plex item', {
        ratingKey,
        existingLabels,
        userLabels,
        tagLabels,
        finalLabels,
        mode: this.removedLabelMode,
        hasWebhookTags: tagLabels.length > 0,
      })

      // Update the labels in Plex with single API call
      const success = await this.plexServer.updateLabels(ratingKey, finalLabels)

      if (success) {
        this.log.debug(
          `Successfully updated combined labels for item ${ratingKey}`,
          {
            totalLabels: finalLabels.length,
            userCount: users.length,
            tagCount: tagLabels.length,
          },
        )

        // Track combined user and tag labels in the database for each watchlist item
        let trackingErrors = 0
        for (const user of users) {
          const userLabel = `${this.config.labelPrefix}:${user.username}`
          // Combine user label with tag labels for this watchlist item
          const combinedLabels = [userLabel, ...tagLabels]

          try {
            await this.db.trackPlexLabels(
              'unknown-content',
              user.user_id,
              ratingKey,
              combinedLabels,
            )
            this.log.debug('Successfully tracked combined labels in database', {
              watchlistId: user.watchlist_id,
              ratingKey,
              userLabel,
              tagLabels,
              combinedLabels,
            })
          } catch (error) {
            this.log.error(
              `Failed to track combined labels in database for watchlist ${user.watchlist_id}:`,
              error,
            )
            trackingErrors++
          }
        }

        if (trackingErrors > 0) {
          this.log.warn(
            `Labels applied to Plex but ${trackingErrors} tracking records failed to save`,
            {
              ratingKey,
              successfulTracks: users.length - trackingErrors,
              failedTracks: trackingErrors,
            },
          )
        }
      } else {
        this.log.warn(`Failed to update combined labels for item ${ratingKey}`)
      }

      return success
    } catch (error) {
      this.log.error(
        `Error applying combined labels to item ${ratingKey}:`,
        error,
      )
      return false
    }
  }

  /**
   * Adds watchlist item to the pending sync queue for later processing
   *
   * @param watchlistItemId - The watchlist item ID
   * @param title - The content title for human readability
   * @param webhookTags - Optional webhook tags to store for later application
   */
  async queuePendingLabelSyncByWatchlistId(
    watchlistItemId: number,
    title: string,
    webhookTags: string[] = [],
  ): Promise<void> {
    try {
      await this.db.createPendingLabelSync(
        watchlistItemId,
        title,
        30, // 30 minute default expiration
        webhookTags,
      )
    } catch (error) {
      this.log.error('Error queuing pending label sync:', error)
    }
  }

  /**
   * Syncs labels for a single watchlist item by resolving GUID to rating key
   *
   * @param watchlistItem - The watchlist item with GUID part in key field
   * @param webhookTags - Optional tags from webhook for immediate tag sync
   * @returns Promise resolving to true if successful, false otherwise
   */
  private async syncLabelForWatchlistItem(
    watchlistItem: {
      id: string | number
      title: string
      key: string | null
      user_id: number
      type?: string
    },
    webhookTags?: string[],
  ): Promise<boolean> {
    try {
      if (!watchlistItem.key) {
        this.log.warn('Watchlist item missing Plex key', {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
        })
        return false
      }

      // Get user information
      const user = await this.db
        .knex('users')
        .where('id', watchlistItem.user_id)
        .select('id', 'name')
        .first()

      if (!user) {
        this.log.warn('User not found for watchlist item', {
          itemId: watchlistItem.id,
          userId: watchlistItem.user_id,
        })
        return false
      }

      const username = user.name || `user_${user.id}`

      // The watchlist item key contains a GUID part, not a rating key
      // We need to construct the full GUID and search for the rating key
      let fullGuid: string

      // Determine content type from watchlist item to construct proper GUID
      const contentType = watchlistItem.type || 'movie' // Default to movie if type not specified

      if (contentType === 'show') {
        fullGuid = `plex://show/${watchlistItem.key}`
      } else {
        // For movies and other content types
        fullGuid = `plex://movie/${watchlistItem.key}`
      }

      this.log.debug('Resolving GUID to rating key for label sync', {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        guidPart: watchlistItem.key,
        fullGuid,
        contentType,
      })

      // Search for the content in Plex using the full GUID
      const plexItems = await this.plexServer.searchByGuid(fullGuid)

      if (plexItems.length === 0) {
        this.log.debug('Content not found in Plex library', {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
          guidPart: watchlistItem.key,
          fullGuid,
          contentType,
        })

        // Queue for pending sync since content might be added to Plex later
        await this.queuePendingLabelSyncByWatchlistId(
          Number(watchlistItem.id),
          watchlistItem.title,
          webhookTags || [],
        )

        return false
      }

      // Apply labels to all found items (handles multiple versions)
      let allSuccessful = true
      for (const plexItem of plexItems) {
        this.log.debug('Applying labels to Plex item', {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
          ratingKey: plexItem.ratingKey,
          plexTitle: plexItem.title,
          hasWebhookTags: webhookTags && webhookTags.length > 0,
          webhookTagCount: webhookTags?.length || 0,
        })

        // Apply combined user and webhook tag labels in a single API call
        const success = await this.applyLabelsToSingleItem(
          plexItem.ratingKey,
          [
            {
              user_id: watchlistItem.user_id,
              username,
              watchlist_id: Number(watchlistItem.id),
            },
          ],
          webhookTags,
          watchlistItem.type || 'movie',
        )

        if (!success) {
          allSuccessful = false
        }
      }

      this.log.debug('GUID-resolved label sync completed', {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        guidPart: watchlistItem.key,
        fullGuid,
        plexItemsFound: plexItems.length,
        ratingKeys: plexItems.map((item) => item.ratingKey),
        username,
        allSuccessful,
      })

      return allSuccessful
    } catch (error) {
      this.log.error('Error syncing label for watchlist item:', error)
      return false
    }
  }

  /**
   * Groups watchlist items by content GUID to avoid duplicate processing
   * This method is now deprecated - use getUsersWithContent() instead for proper username resolution
   *
   * @param watchlistItems - Array of watchlist items from database
   * @returns Array of grouped content with associated users
   * @deprecated Use getUsersWithContent() for proper username resolution
   */
  private async groupByContentGuid(
    watchlistItems: Array<{
      id: string | number
      user_id: number
      guids?: string[] | string
      title: string
    }>,
  ): Promise<GroupedWatchlistContent[]> {
    const guidMap = new Map<string, GroupedWatchlistContent>()

    // Get all unique user IDs
    const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]

    // Fetch actual usernames
    const users = await this.db
      .knex('users')
      .whereIn('id', userIds)
      .select('id', 'name')

    const userMap = new Map(
      users.map((user) => [user.id, user.name || `user_${user.id}`]),
    )

    for (const item of watchlistItems) {
      // Skip items without GUIDs
      if (!item.guids) {
        continue
      }

      const parsedGuids = parseGuids(item.guids)

      // Use the first GUID as the primary identifier
      if (parsedGuids.length > 0) {
        const primaryGuid = parsedGuids[0]

        if (!guidMap.has(primaryGuid)) {
          guidMap.set(primaryGuid, {
            guid: primaryGuid,
            title: item.title,
            users: [],
          })
        }

        const group = guidMap.get(primaryGuid)
        if (!group) {
          continue
        }

        group.users.push({
          user_id: item.user_id,
          username: userMap.get(item.user_id) || `user_${item.user_id}`,
          watchlist_id: Number(item.id),
        })
      }
    }

    return Array.from(guidMap.values())
  }

  /**
   * Extracts tags from webhook payload
   *
   * @param webhook - The webhook payload
   * @returns Array of tags from the webhook, or empty array if none available
   */
  private extractTagsFromWebhook(webhook: WebhookPayload): string[] {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return []
      }

      if ('movie' in webhook && webhook.movie.tags) {
        // Radarr webhook
        return webhook.movie.tags
      }

      if ('series' in webhook && webhook.series.tags) {
        // Sonarr webhook
        return webhook.series.tags
      }

      return []
    } catch (error) {
      this.log.error('Error extracting tags from webhook:', error)
      return []
    }
  }

  /**
   * Extracts content GUID from webhook payload
   *
   * @param webhook - The webhook payload
   * @returns The content GUID or null if not extractable
   */
  private extractContentGuidFromWebhook(
    webhook: WebhookPayload,
  ): string | null {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return null
      }

      if ('movie' in webhook) {
        // Radarr webhook
        return `tmdb:${webhook.movie.tmdbId}`
      }

      if ('series' in webhook) {
        // Sonarr webhook
        return `tvdb:${webhook.series.tvdbId}`
      }

      return null
    } catch (error) {
      this.log.error('Error extracting content GUID from webhook:', error)
      return null
    }
  }

  /**
   * Extracts content title from webhook payload
   *
   * @param webhook - The webhook payload
   * @returns The content title or a fallback
   */
  private getContentTitleFromWebhook(webhook: WebhookPayload): string {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return 'Test Content'
      }

      if ('movie' in webhook) {
        return webhook.movie.title
      }

      if ('series' in webhook) {
        return webhook.series.title
      }

      return 'Unknown Content'
    } catch (error) {
      this.log.error('Error extracting content title from webhook:', error)
      return 'Unknown Content'
    }
  }

  /**
   * Gets all users who have specific content in their watchlist
   *
   * @param guid - The content GUID to search for
   * @returns Promise resolving to array of users with this content and their watchlist IDs
   */
  private async getUsersWithContent(
    guid: string,
  ): Promise<
    Array<{ user_id: number; username: string; watchlist_id: number }>
  > {
    try {
      this.log.debug(`getUsersWithContent called for GUID: ${guid}`)

      // Use the proper database method to get watchlist items by GUID
      const watchlistItems = await this.db.getWatchlistItemsByGuid(guid)

      this.log.debug(
        `Found ${watchlistItems.length} watchlist items for GUID ${guid}`,
        {
          items: watchlistItems.map((item) => ({
            id: item.id,
            user_id: item.user_id,
            title: item.title,
            guids: item.guids,
          })),
        },
      )

      if (watchlistItems.length === 0) {
        this.log.debug(`No watchlist items found for GUID: ${guid}`)
        return []
      }

      // Get unique user IDs and fetch user information
      const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]
      this.log.debug(`Fetching user information for user IDs: ${userIds}`)

      const users = await this.db
        .knex('users')
        .whereIn('id', userIds)
        .select('id', 'name')

      this.log.debug(`Found ${users.length} users:`, {
        users: users.map((user) => ({ id: user.id, name: user.name })),
      })

      // Create a map for quick user lookup
      const userMap = new Map(
        users.map((user) => [user.id, user.name || `user_${user.id}`]),
      )

      // Return combined information with watchlist IDs
      const result = watchlistItems.map((item) => ({
        user_id: item.user_id,
        username: userMap.get(item.user_id) || `user_${item.user_id}`,
        watchlist_id: Number(item.id), // Convert string ID to number for tracking
      }))

      this.log.debug(
        `getUsersWithContent returning ${result.length} users for GUID ${guid}:`,
        {
          result: result.map((r) => ({
            user_id: r.user_id,
            username: r.username,
            watchlist_id: r.watchlist_id,
          })),
        },
      )

      return result
    } catch (error) {
      this.log.error('Error getting users with content:', error)
      return []
    }
  }

  /**
   * Processes pending label syncs and retries failed items
   * This should be called periodically by a scheduler
   *
   * @returns Promise resolving to processing results
   */
  async processPendingLabelSyncs(): Promise<SyncResult> {
    if (!this.config.enabled) {
      return { processed: 0, updated: 0, failed: 0, pending: 0 }
    }

    const result: SyncResult = {
      processed: 0,
      updated: 0,
      failed: 0,
      pending: 0,
    }

    try {
      // Get pending syncs with their watchlist items and Plex keys
      const pendingSyncs: PendingLabelSyncWithPlexKeys[] =
        await this.db.getPendingLabelSyncsWithPlexKeys()

      // Process silently - completion will be logged by the processor service if items were updated

      // Process pending syncs in parallel with configurable concurrency limit
      const concurrencyLimit = this.config.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)

      const pendingProcessingResults = await Promise.allSettled(
        pendingSyncs.map((pendingSync) =>
          limit(async () => {
            const syncResult = {
              processed: 0,
              updated: 0,
              failed: 0,
              pending: 0,
            }

            try {
              syncResult.processed++

              // Check if watchlist item has GUID part now
              if (!pendingSync.plex_key) {
                // Update retry count
                await this.db.updatePendingLabelSyncRetry(pendingSync.id)
                syncResult.pending++
                this.log.debug('Pending sync still missing GUID part', {
                  watchlistItemId: pendingSync.watchlist_item_id,
                  title: pendingSync.content_title,
                })
                return syncResult
              }

              // Get user information
              const user = await this.db
                .knex('users')
                .where('id', pendingSync.user_id)
                .select('id', 'name')
                .first()

              if (!user) {
                // Remove from pending queue if user doesn't exist
                await this.db.deletePendingLabelSync(pendingSync.id)
                this.log.debug('Removed pending sync for non-existent user', {
                  userId: pendingSync.user_id,
                  title: pendingSync.content_title,
                })
                return syncResult
              }

              const username = user.name || `user_${user.id}`

              // The plex_key contains a GUID part, need to resolve to rating key
              let fullGuid: string
              const contentType = pendingSync.type || 'movie'

              if (contentType === 'show') {
                fullGuid = `plex://show/${pendingSync.plex_key}`
              } else {
                fullGuid = `plex://movie/${pendingSync.plex_key}`
              }

              this.log.debug('Resolving GUID to rating key for pending sync', {
                watchlistItemId: pendingSync.watchlist_item_id,
                title: pendingSync.content_title,
                guidPart: pendingSync.plex_key,
                fullGuid,
                contentType,
              })

              // Search for the content in Plex using the full GUID
              const plexItems = await this.plexServer.searchByGuid(fullGuid)

              if (plexItems.length === 0) {
                // Content not found yet, update retry count and keep pending
                await this.db.updatePendingLabelSyncRetry(pendingSync.id)
                syncResult.pending++
                this.log.debug(
                  'Content still not found in Plex library for pending sync',
                  {
                    watchlistItemId: pendingSync.watchlist_item_id,
                    title: pendingSync.content_title,
                    guid: fullGuid,
                  },
                )
                return syncResult
              }

              // Use tracking table as source of truth for all users who should have labels
              // This ensures consistency with "keep" and "special-label" removal modes
              const primaryRatingKey = plexItems[0].ratingKey

              // Get all tracked labels for this content from the tracking table
              const trackedLabels =
                await this.db.getTrackedLabelsForRatingKey(primaryRatingKey)

              // Build user list from tracking records (existing labels)
              const trackedUsers = new Map<
                number,
                { user_id: number; username: string; watchlist_id: number }
              >()
              const allUsers = await this.db.getAllUsers()
              const userMap = new Map(allUsers.map((user) => [user.id, user]))

              // Add users from existing tracking records
              for (const tracking of trackedLabels) {
                if (!trackedUsers.has(tracking.user_id)) {
                  const user = userMap.get(tracking.user_id)
                  if (user) {
                    trackedUsers.set(tracking.user_id, {
                      user_id: user.id,
                      username: user.name || `user_${user.id}`,
                      watchlist_id: 0, // Not used in content-based tracking
                    })
                  }
                }
              }

              // Add the new user from the pending sync if not already tracked
              if (!trackedUsers.has(pendingSync.watchlist_item_id)) {
                const newUser = userMap.get(pendingSync.user_id)
                if (newUser) {
                  trackedUsers.set(pendingSync.watchlist_item_id, {
                    user_id: newUser.id,
                    username: newUser.name || `user_${newUser.id}`,
                    watchlist_id: pendingSync.watchlist_item_id,
                  })
                }
              }

              const allUsersForContent = Array.from(trackedUsers.values())

              this.log.debug(
                'Found all users for pending sync using tracking table',
                {
                  ratingKey: primaryRatingKey,
                  contentKey: pendingSync.plex_key,
                  title: pendingSync.content_title,
                  existingTrackedLabels: trackedLabels.length,
                  totalUsers: allUsersForContent.length,
                  usernames: allUsersForContent.map((u) => u.username),
                  approach: 'tracking-table-based',
                },
              )

              // Apply labels to all found items for ALL users (content-centric approach)
              let allSuccessful = true
              for (const plexItem of plexItems) {
                const success = await this.applyLabelsToSingleItem(
                  plexItem.ratingKey,
                  allUsersForContent, // Pass ALL users instead of just one
                  pendingSync.webhook_tags,
                  pendingSync.type || 'movie',
                )

                if (!success) {
                  allSuccessful = false
                }
              }

              const success = allSuccessful

              if (success) {
                // Remove from pending queue
                await this.db.deletePendingLabelSync(pendingSync.id)

                syncResult.updated++
                this.log.debug('Successfully processed pending sync', {
                  watchlistItemId: pendingSync.watchlist_item_id,
                  title: pendingSync.content_title,
                  guidPart: pendingSync.plex_key,
                  fullGuid,
                  plexItemsFound: plexItems.length,
                  ratingKeys: plexItems.map((item) => item.ratingKey),
                  username,
                })
              } else {
                // Update retry count for failed attempts
                await this.db.updatePendingLabelSyncRetry(pendingSync.id)
                syncResult.failed++
              }
            } catch (error) {
              this.log.error(
                `Error processing pending sync for watchlist item ${pendingSync.watchlist_item_id} (${pendingSync.content_title}):`,
                error,
              )
              // Update retry count for errors
              await this.db.updatePendingLabelSyncRetry(pendingSync.id)
              syncResult.failed++
            }

            return syncResult
          }),
        ),
      )

      // Aggregate results
      for (const promiseResult of pendingProcessingResults) {
        if (promiseResult.status === 'fulfilled') {
          const syncResult = promiseResult.value
          result.processed += syncResult.processed
          result.updated += syncResult.updated
          result.failed += syncResult.failed
          result.pending += syncResult.pending
        } else {
          this.log.error('Error processing pending sync:', promiseResult.reason)
          result.failed++
        }
      }

      // Clean up expired pending syncs
      const expiredCount = await this.db.expirePendingLabelSyncs()

      if (expiredCount > 0) {
        this.log.info(`Cleaned up ${expiredCount} expired pending syncs`)
      }

      // Completion will be logged by the processor service with more details
      return result
    } catch (error) {
      this.log.error('Error processing pending label syncs:', error)
      throw error
    }
  }

  /**
   * Selects which Plex items to label based on configuration
   * Can label all versions or just the first one found
   *
   * @param plexItems - Array of found Plex items for the same content
   * @returns Array of items to label
   */
  private selectItemsForLabeling(
    plexItems: Array<{ ratingKey: string; title: string }>,
  ): Array<{ ratingKey: string; title: string }> {
    if (plexItems.length === 0) {
      return []
    }

    this.log.debug(`Found ${plexItems.length} item(s) in Plex to label`, {
      items: plexItems.map((item) => ({
        ratingKey: item.ratingKey,
        title: item.title,
      })),
    })
    return plexItems
  }

  /**
   * Removes labels associated with watchlist items that are being deleted
   *
   * This method handles cleanup of Plex labels when watchlist items are removed.
   * It uses the provided watchlist item data to clean up tracking records and
   * remove corresponding labels from Plex content.
   *
   * @param watchlistItems - Array of watchlist items that are being deleted with full data
   */
  async cleanupLabelsForWatchlistItems(
    watchlistItems: Array<{
      id: number
      title?: string
      key: string
      user_id: number
    }>,
  ): Promise<void> {
    if (!this.config.enabled || watchlistItems.length === 0) {
      return
    }

    // Check the removed label mode configuration
    if (this.removedLabelMode === 'keep') {
      this.log.debug(
        'Label removal mode is set to "keep", preserving both labels and tracking records for deleted watchlist items',
        {
          itemCount: watchlistItems.length,
        },
      )
      // In "keep" mode, preserve both labels in Plex AND tracking records in database
      // This maintains the tracking table as the source of truth and enables orphaned cleanup
      return
    }

    if (this.removedLabelMode === 'special-label') {
      this.log.debug(
        'Label removal mode is set to "special-label", applying special removed labels instead of removing labels for deleted watchlist items',
        {
          itemCount: watchlistItems.length,
        },
      )
      await this.handleSpecialLabelModeForDeletedItems(watchlistItems)
      return
    }

    this.log.debug('Starting label cleanup for deleted watchlist items', {
      itemCount: watchlistItems.length,
      items: watchlistItems.map((item) => ({
        id: item.id,
        title: item.title || 'Unknown',
      })),
    })

    try {
      // Convert raw item keys to primary GUIDs for tracking lookups
      const itemGuidMap = new Map<number, string>() // Map item.id -> primaryGuid

      // Get all tracked labels for these watchlist items
      const trackedLabels = []
      for (const item of watchlistItems) {
        // Get the full watchlist item to access the guids
        const fullItem = await this.db.getWatchlistItemById(item.id)
        if (!fullItem || !fullItem.guids) {
          this.log.debug('Skipping item - no full item or guids found', {
            itemId: item.id,
            title: item.title,
            hasFullItem: !!fullItem,
            hasGuids: !!fullItem?.guids,
          })
          continue
        }

        // Parse GUIDs to get the primary GUID (same logic as label application)
        const parsedGuids = parseGuids(fullItem.guids)
        if (parsedGuids.length === 0) {
          this.log.debug('Skipping item - no parsed GUIDs available', {
            itemId: item.id,
            title: item.title,
            rawGuids: fullItem.guids,
          })
          continue
        }

        const primaryGuid = parsedGuids[0]
        itemGuidMap.set(item.id, primaryGuid) // Store mapping for later cleanup

        this.log.debug(
          `Getting tracked labels for primary GUID: ${primaryGuid} (was looking for raw key: ${item.key}), user_id: ${item.user_id}`,
        )

        const labels = await this.db.getTrackedLabelsForContent(primaryGuid)
        this.log.debug(
          `Found ${labels.length} total tracking records for primary GUID: ${primaryGuid}`,
          {
            allTrackingRecords: labels.map((l) => ({
              id: l.id,
              user_id: l.user_id,
              plex_rating_key: l.plex_rating_key,
              labels_applied: l.labels_applied,
            })),
          },
        )

        // Filter to only this user's labels
        const userLabels = labels.filter(
          (label) => label.user_id === item.user_id,
        )
        this.log.debug(
          `Found ${userLabels.length} user-specific tracking records for primary GUID: ${primaryGuid}, user_id: ${item.user_id}`,
          {
            userTrackingRecords: userLabels.map((l) => ({
              id: l.id,
              plex_rating_key: l.plex_rating_key,
              labels_applied: l.labels_applied,
            })),
          },
        )
        trackedLabels.push(...userLabels)
      }

      this.log.debug(`Found ${trackedLabels.length} tracked labels to remove`, {
        trackedLabels: trackedLabels.map((t) => ({
          id: t.id,
          content_key: t.content_key,
          user_id: t.user_id,
          plex_rating_key: t.plex_rating_key,
          labels_applied: t.labels_applied,
        })),
      })

      if (trackedLabels.length === 0) {
        this.log.debug(
          'No tracked labels found for cleanup, skipping Plex API calls',
        )
        // Still need to cleanup tracking records using primary GUIDs
        for (const item of watchlistItems) {
          const primaryGuid = itemGuidMap.get(item.id)
          if (primaryGuid) {
            await this.db.cleanupUserContentTracking(primaryGuid, item.user_id)
          }
        }
        return
      }

      // Group by rating key to batch operations
      const labelsByRatingKey = new Map<string, string[]>()
      for (const tracking of trackedLabels) {
        const existingLabels =
          labelsByRatingKey.get(tracking.plex_rating_key) || []
        // Add all labels from this tracking record
        existingLabels.push(...tracking.labels_applied)
        labelsByRatingKey.set(tracking.plex_rating_key, existingLabels)
      }

      this.log.debug('Grouped labels by rating key for batch removal', {
        ratingKeys: Array.from(labelsByRatingKey.keys()),
        labelsByRatingKey: Array.from(labelsByRatingKey.entries()).map(
          ([ratingKey, labels]) => ({
            ratingKey,
            labelCount: labels.length,
            labels,
          }),
        ),
      })

      // Remove labels from Plex content
      const concurrencyLimit = this.config.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)
      let removedCount = 0

      const labelRemovalResults = await Promise.allSettled(
        Array.from(labelsByRatingKey.entries()).map(([ratingKey, labels]) =>
          limit(async () => {
            try {
              const success = await this.plexServer.removeSpecificLabels(
                ratingKey,
                labels,
              )
              if (success) {
                this.log.debug(
                  `Removed ${labels.length} labels from Plex content`,
                  {
                    ratingKey,
                    labels,
                  },
                )
                return labels.length
              }
              this.log.warn(
                `Failed to remove labels from Plex content ${ratingKey}`,
                { labels },
              )
              return 0
            } catch (error) {
              this.log.warn(
                `Failed to remove labels from Plex content ${ratingKey}:`,
                error,
              )
              return 0
            }
          }),
        ),
      )

      // Aggregate successful removals
      for (const result of labelRemovalResults) {
        if (result.status === 'fulfilled') {
          removedCount += result.value
        }
      }

      // Clean up tracking records from database using primary GUIDs
      for (const item of watchlistItems) {
        const primaryGuid = itemGuidMap.get(item.id)
        if (primaryGuid) {
          await this.db.cleanupUserContentTracking(primaryGuid, item.user_id)
        }
      }

      this.log.info(
        `Completed label cleanup for ${watchlistItems.length} deleted watchlist items`,
        {
          trackedLabelsRemoved: trackedLabels.length,
          plexLabelsRemoved: removedCount,
        },
      )
    } catch (error) {
      this.log.error('Error during label cleanup for watchlist items:', error)
      // Don't throw - label cleanup failure shouldn't prevent item deletion
    }
  }

  /**
   * Handles special label mode for deleted watchlist items by replacing user labels with special "removed" labels
   *
   * @param watchlistItems - Array of watchlist items that are being deleted
   */
  private async handleSpecialLabelModeForDeletedItems(
    watchlistItems: Array<{
      id: number
      title?: string
      key: string
      user_id: number
    }>,
  ): Promise<void> {
    try {
      // Get all tracked labels for these watchlist items
      const trackedLabels: PlexLabelTracking[] = []
      const itemGuidMap = new Map<number, string>() // Map item.id -> primaryGuid

      for (const item of watchlistItems) {
        // Get the full watchlist item to access the guids
        const fullItem = await this.db.getWatchlistItemById(item.id)
        if (!fullItem || !fullItem.guids) {
          this.log.debug(
            'Skipping special label item - no full item or guids found',
            {
              itemId: item.id,
              title: item.title,
            },
          )
          continue
        }

        // Parse GUIDs to get the primary GUID
        const parsedGuids = parseGuids(fullItem.guids)
        if (parsedGuids.length === 0) {
          this.log.debug(
            'Skipping special label item - no parsed GUIDs available',
            {
              itemId: item.id,
              title: item.title,
            },
          )
          continue
        }

        const primaryGuid = parsedGuids[0]
        itemGuidMap.set(item.id, primaryGuid)

        const labels = await this.db.getTrackedLabelsForContent(primaryGuid)
        // Filter to only this user's labels
        const userLabels = labels.filter(
          (label) => label.user_id === item.user_id,
        )
        trackedLabels.push(...userLabels)
      }

      if (trackedLabels.length === 0) {
        // Clean up tracking records and return
        for (const item of watchlistItems) {
          const primaryGuid = itemGuidMap.get(item.id)
          if (primaryGuid) {
            await this.db.cleanupUserContentTracking(primaryGuid, item.user_id)
          }
        }
        return
      }

      // Group by rating key to batch operations
      const labelsByRatingKey = new Map<string, string[]>()
      for (const tracking of trackedLabels) {
        const existingLabels =
          labelsByRatingKey.get(tracking.plex_rating_key) || []
        existingLabels.push(...tracking.labels_applied)
        labelsByRatingKey.set(tracking.plex_rating_key, existingLabels)
      }

      const concurrencyLimit = this.config.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)
      let processedCount = 0

      // For each rating key, replace user labels with special removed label
      const specialLabelResults = await Promise.allSettled(
        Array.from(labelsByRatingKey.entries()).map(([ratingKey, labels]) =>
          limit(async () => {
            try {
              // Get current labels on the content
              const currentLabels =
                await this.plexServer.getCurrentLabels(ratingKey)

              // Find user labels that need to be replaced
              const userLabelsToRemove = labels.filter((label: string) =>
                this.isAppUserLabel(label),
              )
              const nonUserLabels = currentLabels.filter(
                (label: string) => !this.isAppUserLabel(label),
              )

              if (userLabelsToRemove.length > 0) {
                // Get the item title for the special label
                // Find the watchlist item for this content by matching the tracking record
                let itemTitle = 'Unknown'
                for (const item of watchlistItems) {
                  const fullItem = await this.db.getWatchlistItemById(item.id)
                  if (
                    fullItem &&
                    trackedLabels.some(
                      (t) =>
                        t.plex_rating_key === ratingKey &&
                        t.content_key === fullItem.key &&
                        t.user_id === fullItem.user_id,
                    )
                  ) {
                    itemTitle = item.title || fullItem.title || 'Unknown'
                    break
                  }
                }

                const removedLabel = await this.getRemovedLabel(itemTitle)
                const finalLabels = [
                  ...new Set([...nonUserLabels, removedLabel]),
                ]

                // Apply the new label set
                const success = await this.plexServer.updateLabels(
                  ratingKey,
                  finalLabels,
                )
                if (success) {
                  this.log.debug(
                    `Applied special removed label to content ${ratingKey}`,
                    {
                      removedLabel,
                      userLabelsRemoved: userLabelsToRemove.length,
                    },
                  )
                  return 1
                }
              }
              return 0
            } catch (error) {
              this.log.warn(
                `Failed to apply special removed label to content ${ratingKey}:`,
                error,
              )
              return 0
            }
          }),
        ),
      )

      // Count successful operations
      for (const result of specialLabelResults) {
        if (result.status === 'fulfilled') {
          processedCount += result.value
        }
      }

      // Clean up tracking records from database using primary GUIDs
      for (const item of watchlistItems) {
        const primaryGuid = itemGuidMap.get(item.id)
        if (primaryGuid) {
          await this.db.cleanupUserContentTracking(primaryGuid, item.user_id)
        }
      }

      this.log.info(
        `Completed special label handling for ${watchlistItems.length} deleted watchlist items`,
        {
          trackedLabelsFound: trackedLabels.length,
          contentItemsProcessed: processedCount,
        },
      )
    } catch (error) {
      this.log.error(
        'Error during special label handling for deleted watchlist items:',
        error,
      )
      // Still clean up tracking records on error
      for (const item of watchlistItems) {
        try {
          const fullItem = await this.db.getWatchlistItemById(item.id)
          if (fullItem) {
            await this.db.cleanupUserContentTracking(
              fullItem.key,
              fullItem.user_id,
            )
          }
        } catch (cleanupError) {
          this.log.warn(
            `Failed to cleanup tracking for item ${item.id}:`,
            cleanupError,
          )
        }
      }
    }
  }

  /**
   * Removes all Pulsarr-created labels from Plex content items that are tracked in the database.
   * This preserves any other labels that were not created by Pulsarr.
   *
   * @param progressCallback - Optional callback to report progress for SSE
   * @returns Promise resolving to removal results
   */
  async removeAllLabels(
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<{ processed: number; removed: number; failed: number }> {
    if (!this.config.enabled) {
      this.log.debug('Plex label sync is disabled, skipping label removal')
      return { processed: 0, removed: 0, failed: 0 }
    }

    const result = {
      processed: 0,
      removed: 0,
      failed: 0,
    }

    try {
      this.log.info('Starting bulk Plex label removal')
      progressCallback?.(5, 'Starting Plex label removal...')

      // Get all tracked labels from database
      const trackedLabels = await this.db.getAllTrackedLabels()
      this.log.info(`Found ${trackedLabels.length} tracked labels to process`)
      progressCallback?.(
        15,
        `Found ${trackedLabels.length} tracked labels to process`,
      )

      // Group by rating key to batch operations
      const labelsByRatingKey = new Map<string, string[]>()
      for (const tracking of trackedLabels) {
        const existingLabels =
          labelsByRatingKey.get(tracking.plex_rating_key) || []
        // Add all labels from this tracking record
        existingLabels.push(...tracking.labels_applied)
        labelsByRatingKey.set(tracking.plex_rating_key, existingLabels)
      }

      progressCallback?.(25, `Processing ${labelsByRatingKey.size} items`)

      // Process label removal in parallel with configurable concurrency limit
      const concurrencyLimit = this.config.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)
      let processedCount = 0
      const ratingKeyEntries = Array.from(labelsByRatingKey.entries())

      const labelRemovalResults = await Promise.allSettled(
        ratingKeyEntries.map(([ratingKey, labels]) =>
          limit(async () => {
            const itemResult = {
              processed: 0,
              removed: 0,
              failed: 0,
            }

            try {
              itemResult.processed++
              processedCount++

              // Report progress during processing
              if (ratingKeyEntries.length > 0) {
                const processProgress =
                  25 +
                  Math.floor((processedCount / ratingKeyEntries.length) * 65)
                progressCallback?.(
                  processProgress,
                  `Processing item ${processedCount}/${ratingKeyEntries.length}`,
                )
              }

              // Get current labels and remove only Pulsarr-created labels
              const metadata = await this.plexServer.getMetadata(ratingKey)
              const currentLabels =
                metadata?.Label?.map((label) => label.tag) || []

              this.log.debug(
                `Found ${currentLabels.length} current labels for rating key ${ratingKey}`,
                { currentLabels, labelsToRemove: labels },
              )

              // If we have current labels, filter out the ones we want to remove (case-insensitive)
              if (currentLabels.length > 0) {
                const labelsToRemoveLower = labels.map((label) =>
                  label.toLowerCase(),
                )
                const filteredLabels = currentLabels.filter(
                  (label) => !labelsToRemoveLower.includes(label.toLowerCase()),
                )

                this.log.debug(
                  `Filtered labels for rating key ${ratingKey}: ${currentLabels.length} -> ${filteredLabels.length}`,
                  { filteredLabels },
                )

                const success = await this.plexServer.updateLabels(
                  ratingKey,
                  filteredLabels,
                )

                if (success) {
                  itemResult.removed += labels.length

                  // Clean up tracking records for successfully removed labels
                  for (const label of labels) {
                    try {
                      await this.db.removeTrackedLabel(ratingKey, label)
                    } catch (trackingError) {
                      this.log.warn(
                        `Failed to clean up tracking record for label "${label}" on rating key ${ratingKey}:`,
                        trackingError,
                      )
                    }
                  }

                  this.log.debug(
                    `Successfully removed ${labels.length} Pulsarr labels from Plex content`,
                    {
                      ratingKey,
                      labels,
                    },
                  )
                } else {
                  itemResult.failed += labels.length
                  this.log.warn(
                    `Failed to remove labels from rating key ${ratingKey}`,
                    { labels },
                  )
                }
              } else {
                // No current labels found via API - this could be the metadata API issue
                // Use the removeSpecificLabels method which will handle this case better
                this.log.warn(
                  `No current labels found via API for rating key ${ratingKey}, but tracking table indicates ${labels.length} labels should exist. Attempting removal using removeSpecificLabels method.`,
                  { trackedLabels: labels },
                )

                const success = await this.plexServer.removeSpecificLabels(
                  ratingKey,
                  labels,
                )

                if (success) {
                  itemResult.removed += labels.length

                  // Clean up tracking records for successfully removed labels
                  for (const label of labels) {
                    try {
                      await this.db.removeTrackedLabel(ratingKey, label)
                    } catch (trackingError) {
                      this.log.warn(
                        `Failed to clean up tracking record for label "${label}" on rating key ${ratingKey}:`,
                        trackingError,
                      )
                    }
                  }

                  this.log.debug(
                    `Successfully removed ${labels.length} tracked labels using fallback method`,
                    {
                      ratingKey,
                      labels,
                    },
                  )
                } else {
                  itemResult.failed += labels.length
                  this.log.error(
                    `Failed to remove tracked labels even with fallback method for rating key ${ratingKey}`,
                    { labels },
                  )
                }
              }
            } catch (error) {
              this.log.error(
                `Failed to remove labels from Plex content ${ratingKey}:`,
                error,
              )
              itemResult.failed++
            }

            return itemResult
          }),
        ),
      )

      // Aggregate results
      for (const promiseResult of labelRemovalResults) {
        if (promiseResult.status === 'fulfilled') {
          const itemResult = promiseResult.value
          result.processed += itemResult.processed
          result.removed += itemResult.removed
          result.failed += itemResult.failed
        } else {
          this.log.error(
            'Promise rejected during parallel label removal:',
            promiseResult.reason,
          )
          result.failed++
        }
      }

      // Clean up tracking records from database
      await this.db.clearAllLabelTracking()

      this.log.info('Bulk Plex label removal completed', result)
      progressCallback?.(
        100,
        `Completed Plex label removal: removed ${result.removed} labels from ${result.processed} items, ${result.failed} failed`,
      )
      return result
    } catch (error) {
      this.log.error('Error in bulk Plex label removal:', error)
      throw error
    }
  }

  /**
   * Analyzes GUID types for debugging purposes
   *
   * @param guids - Array of GUIDs to analyze
   * @returns Object with counts of different GUID types
   */
  private analyzeGuidTypes(guids: string[]): Record<string, number> {
    const types: Record<string, number> = {}

    for (const guid of guids) {
      if (!guid) continue

      if (guid.startsWith('tmdb:')) {
        types.tmdb = (types.tmdb || 0) + 1
      } else if (guid.startsWith('tvdb:')) {
        types.tvdb = (types.tvdb || 0) + 1
      } else if (guid.startsWith('imdb:')) {
        types.imdb = (types.imdb || 0) + 1
      } else {
        types.other = (types.other || 0) + 1
      }
    }

    return types
  }

  /**
   * Legacy method for backward compatibility
   * Finds a single Plex item by GUID (returns first match)
   *
   * @param guid - The content GUID to search for
   * @param maxRetries - Maximum number of retry attempts
   * @returns Promise resolving to first Plex metadata item or null if not found
   * @deprecated Use findPlexItemsWithRetry for handling multiple versions
   */
  private async findPlexItemWithRetry(
    guid: string,
    maxRetries: number,
  ): Promise<{ ratingKey: string; title: string } | null> {
    const items = await this.findPlexItemsWithRetry(guid, maxRetries)
    return items.length > 0 ? items[0] : null
  }

  /**
   * Cleanup orphaned Plex labels - removes only truly orphaned labels based on current state
   *
   * Proper orphaned cleanup that:
   * 1. Gets all sync-enabled users who should have labels
   * 2. Builds the set of valid labels that should exist
   * 3. Uses tracking table to find labels that exist but are no longer valid
   * 4. Removes only the orphaned labels, preserving legitimate labels
   *
   * @returns Promise resolving to cleanup results
   */
  async cleanupOrphanedPlexLabels(
    radarrMoviesWithTags?: RadarrMovieWithTags[],
    sonarrSeriesWithTags?: SonarrSeriesWithTags[],
  ): Promise<{
    removed: number
    failed: number
  }> {
    if (!this.config.enabled || !this.config.cleanupOrphanedLabels) {
      this.log.debug(
        'Plex label sync or orphaned cleanup disabled, skipping orphaned label cleanup',
      )
      return { removed: 0, failed: 0 }
    }

    const result = { removed: 0, failed: 0 }

    try {
      this.log.info('Starting orphaned Plex label cleanup')

      // Step 1: Get all users with sync enabled
      const allUsers = await this.db.getAllUsers()
      const syncEnabledUsers = allUsers.filter((user) => user.can_sync)

      if (syncEnabledUsers.length === 0) {
        this.log.info('No sync-enabled users found, skipping orphaned cleanup')
        return { removed: 0, failed: 0 }
      }

      this.log.debug(
        `Found ${syncEnabledUsers.length} sync-enabled users out of ${allUsers.length} total users`,
      )

      // Step 2: Build set of valid labels that should exist
      const validLabels = new Set<string>()

      // Add user labels for sync-enabled users
      for (const user of syncEnabledUsers) {
        const userLabel = `${this.config.labelPrefix}:${user.name}`
        validLabels.add(userLabel.toLowerCase())
      }

      // Add tag labels if tag sync is enabled
      if (this.config.tagSync.enabled) {
        try {
          if (radarrMoviesWithTags && sonarrSeriesWithTags) {
            // Use pre-fetched tag data when available (called from sync)
            this.log.debug('Using pre-fetched tag data for cleanup validation')

            // Extract unique tags from Radarr movies
            const radarrTags = new Set<string>()
            for (const movieWithTags of radarrMoviesWithTags) {
              for (const tag of movieWithTags.tags) {
                radarrTags.add(tag)
              }
            }

            // Extract unique tags from Sonarr series
            const sonarrTags = new Set<string>()
            for (const seriesWithTags of sonarrSeriesWithTags) {
              for (const tag of seriesWithTags.tags) {
                sonarrTags.add(tag)
              }
            }

            // Add all unique tags as valid labels
            for (const tag of radarrTags) {
              const tagLabel = `${this.config.labelPrefix}:${tag}`
              validLabels.add(tagLabel.toLowerCase())
            }
            for (const tag of sonarrTags) {
              const tagLabel = `${this.config.labelPrefix}:${tag}`
              validLabels.add(tagLabel.toLowerCase())
            }
          } else {
            // Fetch fresh tag data when called independently
            this.log.debug('Fetching fresh tag data for cleanup validation')

            // Get tags from Radarr instances
            const radarrInstances =
              await this.fastify.radarrManager.getAllInstances()
            for (const instance of radarrInstances) {
              try {
                const radarrService =
                  this.fastify.radarrManager.getRadarrService(instance.id)
                if (!radarrService) {
                  this.log.warn(
                    `Could not get Radarr service for instance ${instance.id}`,
                  )
                  continue
                }

                const tags = await radarrService.getTags()
                for (const tag of tags) {
                  const tagLabel = `${this.config.labelPrefix}:${tag.label}`
                  validLabels.add(tagLabel.toLowerCase())
                }
              } catch (error) {
                this.log.warn(
                  `Failed to get tags from Radarr instance ${instance.name}:`,
                  error,
                )
              }
            }

            // Get tags from Sonarr instances
            const sonarrInstances =
              await this.fastify.sonarrManager.getAllInstances()
            for (const instance of sonarrInstances) {
              try {
                const sonarrService =
                  this.fastify.sonarrManager.getSonarrService(instance.id)
                if (!sonarrService) {
                  this.log.warn(
                    `Could not get Sonarr service for instance ${instance.id}`,
                  )
                  continue
                }

                const tags = await sonarrService.getTags()
                for (const tag of tags) {
                  const tagLabel = `${this.config.labelPrefix}:${tag.label}`
                  validLabels.add(tagLabel.toLowerCase())
                }
              } catch (error) {
                this.log.warn(
                  `Failed to get tags from Sonarr instance ${instance.name}:`,
                  error,
                )
              }
            }
          }
        } catch (error) {
          this.log.warn('Error getting tags for orphaned cleanup:', error)
        }
      }

      this.log.debug(
        `Built ${validLabels.size} valid labels for orphaned cleanup`,
        {
          validLabelsCount: validLabels.size,
          tagSyncEnabled: this.config.tagSync.enabled,
        },
      )

      // Step 3: Use tracking table to find orphaned labels
      const orphanedLabelGroups = await this.db.getOrphanedLabelTracking(
        validLabels,
        this.config.labelPrefix,
      )

      if (orphanedLabelGroups.length === 0) {
        this.log.info('No orphaned labels found in tracking table')
        return { removed: 0, failed: 0 }
      }

      this.log.info(
        `Found orphaned labels on ${orphanedLabelGroups.length} Plex items`,
        {
          affectedItems: orphanedLabelGroups.length,
          totalOrphanedLabels: orphanedLabelGroups.reduce(
            (sum, group) => sum + group.orphaned_labels.length,
            0,
          ),
        },
      )

      // Step 4: Remove orphaned labels from Plex content
      const concurrencyLimit = this.config.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)

      const cleanupResults = await Promise.allSettled(
        orphanedLabelGroups.map((group) =>
          limit(async () => {
            const { plex_rating_key, orphaned_labels } = group

            try {
              // Get current labels from Plex
              const metadata =
                await this.plexServer.getMetadata(plex_rating_key)
              const currentLabels =
                metadata?.Label?.map((label) => label.tag) || []

              if (currentLabels.length === 0) {
                // No labels exist, just clean up tracking
                await this.db.removeOrphanedTracking(
                  plex_rating_key,
                  orphaned_labels,
                )
                return { removed: 0, failed: 0 }
              }

              // Filter out orphaned labels from current labels
              const filteredLabels = currentLabels.filter(
                (label) => !orphaned_labels.includes(label),
              )

              // Only update if we're actually removing labels
              if (filteredLabels.length < currentLabels.length) {
                const success = await this.plexServer.updateLabels(
                  plex_rating_key,
                  filteredLabels,
                )

                if (success) {
                  // Clean up tracking table for removed labels
                  await this.db.removeOrphanedTracking(
                    plex_rating_key,
                    orphaned_labels,
                  )

                  const removedCount =
                    currentLabels.length - filteredLabels.length
                  this.log.debug(
                    `Removed ${removedCount} orphaned labels from content`,
                    {
                      ratingKey: plex_rating_key,
                      title: metadata?.title || 'Unknown',
                      removedLabels: orphaned_labels,
                      remainingLabels: filteredLabels,
                    },
                  )

                  return { removed: removedCount, failed: 0 }
                }
                this.log.error(
                  `Failed to update labels for rating key ${plex_rating_key}`,
                )
                return { removed: 0, failed: orphaned_labels.length }
              }
              // Labels were already removed externally, just clean up tracking
              await this.db.removeOrphanedTracking(
                plex_rating_key,
                orphaned_labels,
              )
              return { removed: 0, failed: 0 }
            } catch (error) {
              this.log.error(
                `Error cleaning up orphaned labels for rating key ${plex_rating_key}:`,
                error,
              )
              return { removed: 0, failed: orphaned_labels.length }
            }
          }),
        ),
      )

      // Aggregate results
      for (const cleanupResult of cleanupResults) {
        if (cleanupResult.status === 'fulfilled') {
          result.removed += cleanupResult.value.removed
          result.failed += cleanupResult.value.failed
        } else {
          result.failed++
        }
      }

      this.log.info('Orphaned Plex label cleanup completed', {
        processedItems: orphanedLabelGroups.length,
        removedLabels: result.removed,
        failedLabels: result.failed,
      })

      return result
    } catch (error) {
      this.log.error('Error during orphaned label cleanup:', error)
      return { removed: 0, failed: 1 }
    }
  }
}
