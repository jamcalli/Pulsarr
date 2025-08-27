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

import type {
  ContentWithUsers,
  LabelReconciliationResult,
  PlexContentItems,
  RadarrMovieWithTags,
  SonarrSeriesWithTags,
  SyncResult,
} from '@root/types/plex-label-sync.types.js'
import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { PendingLabelSyncWithPlexKeys } from '@services/database/methods/plex-label-sync.js'
import type {
  PlexLabelTracking,
  TrackPlexLabelsOperation,
  UntrackPlexLabelOperation,
} from '@services/database/methods/plex-label-tracking.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  extractTmdbId,
  extractTvdbId,
  getGuidMatchScore,
  parseGuids,
} from '@utils/guid-handler.js'
import type { PlexServerService } from '@utils/plex-server.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

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
        autoResetOnScheduledSync: false,
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
    return labelName
      .toLowerCase()
      .startsWith(`${this.config.labelPrefix.toLowerCase()}:`)
  }

  /**
   * Checks if a label is a user-specific label (format: prefix:user:username)
   *
   * @param labelName - The label to check
   * @returns True if this is a user-specific label
   */
  private isUserSpecificLabel(labelName: string): boolean {
    const prefix = this.config.labelPrefix.toLowerCase()
    const lname = labelName.toLowerCase()
    // user labels are "prefix:user:username"
    return lname.startsWith(`${prefix}:user:`)
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
   * Checks if a label is managed by this service (app-prefixed labels + removed markers)
   *
   * @param label - The label to check
   * @returns True if this is a Pulsarr-managed label
   */
  private isManagedLabel(label: string): boolean {
    return (
      this.isAppUserLabel(label) ||
      label.toLowerCase().startsWith(this.removedLabelPrefix.toLowerCase())
    )
  }

  /**
   * Checks if a tag is managed by the user tagging system or is a special removal tag
   *
   * @param tagName - The tag to check
   * @returns True if this is a user tagging system tag or special removal tag
   */
  private isUserTaggingSystemTag(tagName: string): boolean {
    const tagPrefix = this.fastify.config.tagPrefix || 'pulsarr:user'
    const removedTagPrefix =
      this.fastify.config.removedTagPrefix || 'pulsarr:removed'

    return (
      tagName.toLowerCase().startsWith(`${tagPrefix.toLowerCase()}:`) ||
      tagName.toLowerCase().startsWith(removedTagPrefix.toLowerCase())
    )
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
      this.log.error({ error }, 'Error fetching Radarr movies for tag sync:')
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
      this.log.error({ error }, 'Error fetching Sonarr series for tag sync:')
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
      this.log.error({ error }, 'Error matching Plex movie to Radarr:')
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
      this.log.error({ error }, 'Error matching Plex series to Sonarr:')
      return null
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

      // Extract content GUID and type from webhook
      const contentData = this.extractContentGuidFromWebhook(webhook)
      if (!contentData) {
        this.log.warn('Unable to extract content GUID from webhook', {
          webhook,
        })
        return false
      }

      const { guids, contentType } = contentData

      // Extract tag data from webhook if tag sync is enabled
      const webhookTags = this.extractTagsFromWebhook(webhook)

      this.log.debug('Extracted content data from webhook', {
        guids,
        contentType,
        instanceName: webhook.instanceName,
        tags: webhookTags,
        tagSyncEnabled: this.config.tagSync.enabled,
      })

      // Get watchlist items that match this GUID (use first GUID for database lookup)
      const watchlistItems = await this.db.getWatchlistItemsByGuid(guids[0])
      if (watchlistItems.length === 0) {
        this.log.debug('No users have this content in their watchlist yet', {
          guids,
          contentType,
          note: 'Content may be downloaded before appearing in watchlists - will retry when watchlist syncs',
        })
        return true
      }

      this.log.debug('Found watchlist items for webhook content', {
        guids,
        contentType,
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
          guids,
          contentType,
          itemCount: watchlistItems.length,
          labelsApplied: true,
        })
      } else {
        this.log.info(
          'Webhook label sync completed with some items queued for retry',
          {
            guids,
            contentType,
            itemCount: watchlistItems.length,
            labelsApplied: false,
            note: 'Content not yet available in Plex, queued for pending sync',
          },
        )
      }

      return allSuccessful
    } catch (error) {
      this.log.error({ error }, 'Error processing webhook for label sync:')
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

      // Create content-type-aware grouping key using sorted GUIDs for consistent grouping
      const sortedGuids = [...parsedGuids].sort()
      const contentKey = `${item.type}-${JSON.stringify(sortedGuids)}`
      const username = userMap.get(item.user_id) || `user_${item.user_id}`

      const existingContentItem = contentMap.get(contentKey)
      let contentItem: ContentWithUsers

      if (!existingContentItem) {
        contentItem = {
          primaryGuid: contentKey, // Use content-type-aware key as primary identifier
          allGuids: parsedGuids,
          title: item.title,
          type:
            item.type === 'movie' || item.type === 'show' ? item.type : 'movie',
          plexKey: item.key,
          users: [],
        }
        contentMap.set(contentKey, contentItem)
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
      const appliedRemovedLabels = new Map<string, string>() // ratingKey -> removedLabel
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

        // Collect special removed labels for tracking
        if (result.success && result.specialRemovedLabel) {
          appliedRemovedLabels.set(
            plexItem.ratingKey,
            result.specialRemovedLabel,
          )
        }

        if (!result.success) {
          this.log.warn('Failed to reconcile labels for Plex item', {
            ratingKey: plexItem.ratingKey,
            title: plexItem.title,
            error: result.error,
          })
        }
      }

      // Update tracking table to match final state (user + tag labels + removed labels)
      await this.updateTrackingForContent(
        content,
        plexItems,
        allDesiredLabels,
        desiredUserLabels,
        desiredTagLabels,
        appliedRemovedLabels,
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
        // Handle special "removed" label logic:
        // - Add removed label whenever NO user labels exist (safe for deletion),
        //   regardless of tag presence.
        // - If user labels exist, removed label should be cleaned up (content still wanted)
        if (desiredUserLabels.length === 0) {
          // No user labels exist, safe to add removed label for deletion
          specialRemovedLabel = await this.getRemovedLabel(content.title)
          this.log.debug('Generated special removed label', {
            contentTitle: content.title,
            specialRemovedLabel,
            desiredUserLabelsCount: desiredUserLabels.length,
          })
          const nonAppWithoutRemoved = nonAppLabels.filter(
            (label) =>
              !label
                .toLowerCase()
                .startsWith(this.removedLabelPrefix.toLowerCase()),
          )
          finalLabels = [
            ...new Set([...nonAppWithoutRemoved, specialRemovedLabel]),
          ]
          this.log.debug(
            `Added removed label for "${content.title}" - no active users, safe for deletion`,
          )
        } else {
          // User labels exist OR no labels being removed - preserve current user labels
          // This also cleans up any existing removed labels when users are present
          finalLabels = [...new Set([...nonAppLabels, ...allDesiredLabels])]

          const removedLabelsFiltered =
            currentLabels.some((l) =>
              l.toLowerCase().startsWith(this.removedLabelPrefix.toLowerCase()),
            ) &&
            !finalLabels.some((l) =>
              l.toLowerCase().startsWith(this.removedLabelPrefix.toLowerCase()),
            )
          if (removedLabelsFiltered && desiredUserLabels.length > 0) {
            this.log.debug(
              `Cleaned up removed label for "${content.title}" - active users still want this content`,
            )
          }
        }
      } else {
        // Default 'remove' mode - clean removal of obsolete labels
        finalLabels = [...new Set([...nonAppLabels, ...allDesiredLabels])]
      }

      // Remove any existing "removed" labels when users are re-adding content
      if (desiredUserLabels.length > 0) {
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
        // Recompute deltas across all Pulsarr-managed labels, including the special "removed" marker
        const toLowerSet = (arr: string[]) =>
          new Set(arr.map((s) => s.toLowerCase()))
        const currentManaged = toLowerSet(
          currentLabels.filter((label) => this.isManagedLabel(label)),
        )
        const finalManaged = toLowerSet(
          finalLabels.filter((label) => this.isManagedLabel(label)),
        )
        const addedCount = [...finalManaged].filter(
          (l) => !currentManaged.has(l),
        ).length
        const removedCount = [...currentManaged].filter(
          (l) => !finalManaged.has(l),
        ).length

        this.log.debug('Successfully updated labels for Plex item', {
          ratingKey,
          contentTitle: content.title,
          labelsAdded: addedCount,
          labelsRemoved: removedCount,
        })

        return {
          success: true,
          labelsAdded: addedCount,
          labelsRemoved: removedCount,
          specialRemovedLabel: specialRemovedLabel || undefined,
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
   * Implements true batching by collecting operations and executing in bulk.
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
    appliedRemovedLabels: Map<string, string>,
  ): Promise<void> {
    try {
      this.log.debug('Updating tracking table for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
        userCount: content.users.length,
        plexItemCount: plexItems.length,
        finalUserLabels,
      })

      // Collect operations for bulk processing
      const untrackOperations: UntrackPlexLabelOperation[] = []
      const trackOperations: TrackPlexLabelsOperation[] = []

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

        // Track tag labels per user to align with per-user tracking records
        if (finalTagLabels.length > 0 && content.users.length > 0) {
          for (const tagLabel of finalTagLabels) {
            if (allFinalLabels.includes(tagLabel)) {
              for (const u of content.users) {
                desiredTracking.add(
                  `${u.watchlist_id}:${plexItem.ratingKey}:${tagLabel}`,
                )
              }
            }
          }
        }

        // Track special removed label for this item (system user ID 0)
        const removedLabelForItem = appliedRemovedLabels.get(plexItem.ratingKey)
        if (removedLabelForItem) {
          const systemTrackingKey = `__system__:${plexItem.ratingKey}:${removedLabelForItem}`
          desiredTracking.add(systemTrackingKey)

          this.log.debug('Added system removed label to desired tracking', {
            ratingKey: plexItem.ratingKey,
            removedLabel: removedLabelForItem,
            trackingKey: systemTrackingKey,
          })
        }

        // Collect obsolete tracking records for bulk removal
        for (const tracking of currentTracking) {
          // Check each label in the tracking record
          for (const label of tracking.labels_applied) {
            let trackingKey: string

            if (tracking.user_id === null) {
              // System tracking record for removed labels
              trackingKey = `__system__:${tracking.plex_rating_key}:${label}`
            } else {
              // Regular user tracking record
              const matchingUser = content.users.find(
                (u) => u.user_id === tracking.user_id,
              )
              // Use a sentinel value that cannot collide with a valid watchlist_id
              const ORPHAN_SENTINEL = `__orphaned_user_${tracking.user_id}__`
              const watchlistId = matchingUser?.watchlist_id ?? ORPHAN_SENTINEL
              trackingKey = `${watchlistId}:${tracking.plex_rating_key}:${label}`
            }

            if (!desiredTracking.has(trackingKey)) {
              untrackOperations.push({
                contentGuids: tracking.content_guids,
                userId: tracking.user_id,
                plexRatingKey: tracking.plex_rating_key,
                labelApplied: label,
              })
              this.log.debug('Queued obsolete tracking record for removal', {
                contentKey: tracking.content_guids.join(','),
                userId: tracking.user_id,
                ratingKey: tracking.plex_rating_key,
                label: label,
                isSystemRecord: tracking.user_id === null,
              })
            }
          }
        }

        // Collect tracking operations using efficient array-based approach
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

          // Only queue tracking if there are labels to track
          if (userLabelsForContent.length > 0) {
            trackOperations.push({
              contentGuids: content.allGuids,
              contentType: content.type as 'movie' | 'show',
              userId: user.user_id,
              plexRatingKey: plexItem.ratingKey,
              labelsApplied: userLabelsForContent,
            })
            this.log.debug('Queued complete label tracking operation', {
              watchlistId: user.watchlist_id,
              ratingKey: plexItem.ratingKey,
              labelCount: userLabelsForContent.length,
              labels: userLabelsForContent,
            })
          }
        }
      }

      // Add system tracking operations for removed labels
      for (const [ratingKey, removedLabel] of appliedRemovedLabels) {
        trackOperations.push({
          contentGuids: content.allGuids,
          contentType: content.type as 'movie' | 'show',
          userId: null, // System operation for removed labels
          plexRatingKey: ratingKey,
          labelsApplied: [removedLabel],
        })
        this.log.debug('Queued system tracking operation for removed label', {
          ratingKey,
          removedLabel,
          contentTitle: content.title,
        })
      }

      // Execute bulk operations
      let totalUntracked = 0
      let totalTracked = 0
      let totalFailures = 0

      // Process bulk untracking
      if (untrackOperations.length > 0) {
        this.log.debug('Executing bulk untrack operations', {
          operationCount: untrackOperations.length,
        })
        try {
          const untrackResult =
            await this.db.untrackPlexLabelBulk(untrackOperations)
          totalUntracked = untrackResult.processedCount
          if (untrackResult.failedIds.length > 0) {
            totalFailures += untrackResult.failedIds.length
            this.log.warn('Some untrack operations failed', {
              failedCount: untrackResult.failedIds.length,
              failedIds: untrackResult.failedIds,
            })
          }
        } catch (error) {
          this.log.error('Failed to execute bulk untrack operations', {
            operationCount: untrackOperations.length,
            error: error instanceof Error ? error.message : String(error),
          })
          totalFailures += untrackOperations.length
        }
      }

      // Process bulk tracking
      if (trackOperations.length > 0) {
        this.log.debug('Executing bulk track operations', {
          operationCount: trackOperations.length,
        })
        try {
          const trackResult = await this.db.trackPlexLabelsBulk(trackOperations)
          totalTracked = trackResult.processedCount
          if (trackResult.failedIds.length > 0) {
            totalFailures += trackResult.failedIds.length
            this.log.warn('Some track operations failed', {
              failedCount: trackResult.failedIds.length,
              failedIds: trackResult.failedIds,
            })
          }
        } catch (error) {
          this.log.error('Failed to execute bulk track operations', {
            operationCount: trackOperations.length,
            error: error instanceof Error ? error.message : String(error),
          })
          totalFailures += trackOperations.length
        }
      }

      this.log.debug('Completed tracking table update for content', {
        primaryGuid: content.primaryGuid,
        title: content.title,
        untrackOperations: untrackOperations.length,
        trackOperations: trackOperations.length,
        totalUntracked,
        totalTracked,
        totalFailures,
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
   * Automatically resets dangling labels at the start based on current removal mode.
   *
   * @returns Promise resolving to sync results
   */
  async syncAllLabels(): Promise<SyncResult> {
    this.log.info('Starting Plex label synchronization')

    if (!this.config.enabled) {
      this.log.warn('Plex label sync is disabled, skipping', {
        enabled: this.config.enabled,
      })
      return { processed: 0, updated: 0, failed: 0, pending: 0 }
    }

    const operationId = `plex-label-sync-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    const result: SyncResult = {
      processed: 0,
      updated: 0,
      failed: 0,
      pending: 0,
    }

    try {
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'start',
          progress: 5,
          message: 'Starting Plex label synchronization...',
        })
      }
      // Reset labels if auto-reset is enabled - this handles dangling entries from mode changes
      if (this.config.autoResetOnScheduledSync) {
        this.log.info('Performing automatic label reset before sync', {
          currentMode: this.removedLabelMode,
        })
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'resetting-labels',
            progress: 0,
            message:
              'Resetting existing labels based on current removal mode...',
          })
        }

        try {
          await this.resetLabels()
          if (emitProgress) {
            this.fastify.progress.emit({
              operationId,
              type: 'plex-label-sync',
              phase: 'reset-complete',
              progress: 15,
              message: 'Reset complete, starting sync...',
            })
          }
          this.log.info('Label reset completed successfully')
        } catch (resetError) {
          this.log.error({ error: resetError }, 'Error during label reset:')
          // Continue with sync even if reset fails
          if (emitProgress) {
            this.fastify.progress.emit({
              operationId,
              type: 'plex-label-sync',
              phase: 'reset-failed',
              progress: 15,
              message: 'Reset failed, continuing with sync...',
            })
          }
        }
      }

      this.log.debug('Beginning label sync process')

      // Adjust progress based on whether reset was performed
      const baseProgress = this.config.autoResetOnScheduledSync ? 15 : 0

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
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'complete',
            progress: 100,
            message: 'No content found to label',
          })
        }
        return result
      }

      // Step 2: Fetch tag data from Radarr/Sonarr instances if tag sync is enabled
      let radarrMoviesWithTags: RadarrMovieWithTags[] = []
      let sonarrSeriesWithTags: SonarrSeriesWithTags[] = []

      if (this.config.tagSync.enabled) {
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'fetching-tags',
            progress: baseProgress + 10,
            message: 'Fetching tag data from Radarr/Sonarr instances...',
          })
        }
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

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'processing-content',
          progress: baseProgress + 15,
          message: `Grouping ${watchlistItems.length} watchlist items by content...`,
        })
      }

      // Step 3: Group watchlist items by unique content (content-centric approach)
      const contentItems =
        await this.groupWatchlistItemsByContent(watchlistItems)

      if (contentItems.length === 0) {
        this.log.warn('No valid content items found after grouping')
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'complete',
            progress: 100,
            message: 'No valid content found to process',
          })
        }
        return result
      }

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'processing-content',
          progress: baseProgress + 25,
          message: `Resolving ${contentItems.length} unique content items to Plex items...`,
        })
      }

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
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'complete',
            progress: 100,
            message:
              'No content available in Plex - all items queued for pending sync',
          })
        }
        return result
      }

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'processing-content',
          progress: baseProgress + 40,
          message: `Processing ${available.length} content items with content-centric reconciliation...`,
        })
      }

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
              if (emitProgress) {
                const processProgress =
                  baseProgress +
                  40 +
                  Math.floor((processedContentCount / available.length) * 50)
                this.fastify.progress.emit({
                  operationId,
                  type: 'plex-label-sync',
                  phase: 'processing-content',
                  progress: processProgress,
                  message: `Processing content ${processedContentCount}/${available.length}`,
                })
              }

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
          this.log.error(
            { error: promiseResult.reason },
            'Error processing content item:',
          )
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
          if (emitProgress) {
            this.fastify.progress.emit({
              operationId,
              type: 'plex-label-sync',
              phase: 'cleanup',
              progress: baseProgress + 95,
              message: 'Cleaning up orphaned Plex labels...',
            })
          }
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
          this.log.error(
            { error: cleanupError },
            'Error during orphaned label cleanup:',
          )
          cleanupMessage = ', orphaned cleanup failed'
        }
      }

      this.log.info('Plex label synchronization completed', {
        ...result,
        totalLabelsAdded,
        totalLabelsRemoved,
      })

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'complete',
          progress: 100,
          message: `Completed Plex label sync: updated ${result.updated} items, failed ${result.failed}, pending ${result.pending}${cleanupMessage}`,
        })
      }

      return result
    } catch (error) {
      this.log.error(
        { error },
        'Error in content-centric batch label synchronization',
      )

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'error',
          progress: 100,
          message: `Error syncing Plex labels: ${error}`,
        })
      }

      throw error
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
            // Get the content key from the watchlist item for proper tracking
            const watchlistItem = await this.db.getWatchlistItemById(
              user.watchlist_id,
            )
            const contentGuids = watchlistItem
              ? parseGuids(watchlistItem.guids)
              : [ratingKey]

            if (
              watchlistItem?.type &&
              !['movie', 'show'].includes(watchlistItem.type)
            ) {
              this.log.warn('Unexpected content type, defaulting to movie', {
                watchlistId: user.watchlist_id,
                type: watchlistItem.type,
              })
            }
            const contentType: 'movie' | 'show' =
              watchlistItem?.type === 'show' ? 'show' : 'movie'
            await this.db.trackPlexLabels(
              contentGuids,
              contentType,
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
        { error },
        `Error applying combined labels to item ${ratingKey}`,
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
        10, // 10 minute default expiration
        webhookTags,
      )
    } catch (error) {
      this.log.error({ error }, 'Error queuing pending label sync:')
    }
  }

  /**
   * Fetches tags for a specific watchlist item from the appropriate *arr instances
   * using targeted API calls instead of fetching all content from all instances
   *
   * @param watchlistItem - The watchlist item with GUID and content info
   * @returns Array of tags found for this content, or empty array if no match
   */
  async fetchTagsForWatchlistItem(watchlistItem: {
    id: string | number
    title: string
    key: string | null
    type?: string
    guids?: string[]
    tmdbId?: number
    tvdbId?: number
  }): Promise<string[]> {
    if (!this.config.tagSync.enabled) {
      return []
    }

    try {
      const contentType = watchlistItem.type || 'movie'

      this.log.debug(
        'Fetching tags for watchlist item using all-instances approach',
        {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
          contentType,
          tmdbId: watchlistItem.tmdbId,
          tvdbId: watchlistItem.tvdbId,
        },
      )

      let tags: string[] = []

      if (contentType === 'movie' && this.config.tagSync.syncRadarrTags) {
        // Get ALL Radarr instances like the main workflow does
        const allRadarrInstances =
          await this.fastify.radarrManager.getAllInstances()
        const allInstanceIds = allRadarrInstances.map((instance) => instance.id)

        if (allInstanceIds.length > 0 && watchlistItem.tmdbId) {
          tags = await this.fetchRadarrTagsForItem(
            allInstanceIds,
            watchlistItem.tmdbId,
            watchlistItem.title,
          )
        }
      } else if (contentType === 'show' && this.config.tagSync.syncSonarrTags) {
        // Get ALL Sonarr instances like the main workflow does
        const allSonarrInstances =
          await this.fastify.sonarrManager.getAllInstances()
        const allInstanceIds = allSonarrInstances.map((instance) => instance.id)

        if (allInstanceIds.length > 0 && watchlistItem.tvdbId) {
          tags = await this.fetchSonarrTagsForItem(
            allInstanceIds,
            watchlistItem.tvdbId,
            watchlistItem.title,
          )
        }
      }

      this.log.debug('Successfully fetched tags using targeted approach', {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        tagsFound: tags.length,
        tags,
      })

      return tags
    } catch (error) {
      this.log.error('Error fetching tags for watchlist item:', {
        error,
        itemId: watchlistItem.id,
        title: watchlistItem.title,
      })
      return []
    }
  }

  /**
   * Fetches tags for a specific movie from targeted Radarr instances using TMDB ID lookup
   *
   * @param instanceIds - Array of Radarr instance IDs to check
   * @param tmdbId - TMDB ID of the movie
   * @param title - Movie title for logging
   * @returns Array of tag names found for this movie
   */
  private async fetchRadarrTagsForItem(
    instanceIds: number[],
    tmdbId: number,
    title: string,
  ): Promise<string[]> {
    for (const instanceId of instanceIds) {
      try {
        const radarrService =
          this.fastify.radarrManager.getRadarrService(instanceId)
        if (!radarrService) {
          this.log.warn(
            `Could not get Radarr service for instance ${instanceId}`,
          )
          continue
        }

        // Use the targeted lookup to find the movie
        const movies = await radarrService.getFromRadarr<
          Array<{ id: number; title: string; tags?: number[] }>
        >(`movie/lookup?term=tmdb:${tmdbId}`)

        if (movies.length > 0 && movies[0].id > 0) {
          const movie = movies[0]

          if (movie.tags && movie.tags.length > 0) {
            // Fetch tag definitions to convert IDs to names
            const tagDefinitions = await radarrService.getTags()
            const tagMap = new Map(
              tagDefinitions.map((tag) => [tag.id, tag.label]),
            )

            const tagNames = movie.tags
              .map((tagId: number) => tagMap.get(tagId))
              .filter((tag: string | undefined) => Boolean(tag)) as string[]

            // Filter out user tagging system tags
            const filteredTags = tagNames.filter(
              (tag) => !this.isUserTaggingSystemTag(tag),
            )

            this.log.debug(
              'Found Radarr tags for movie using targeted lookup',
              {
                instanceId,
                tmdbId,
                title,
                movieTitle: movie.title,
                tagIds: movie.tags,
                tagNames: filteredTags,
              },
            )

            return filteredTags
          }
        }
      } catch (error) {
        this.log.warn(
          `Error fetching tags from Radarr instance ${instanceId}:`,
          error,
        )
      }
    }

    return []
  }

  /**
   * Fetches tags for a specific series from targeted Sonarr instances using TVDB ID lookup
   *
   * @param instanceIds - Array of Sonarr instance IDs to check
   * @param tvdbId - TVDB ID of the series
   * @param title - Series title for logging
   * @returns Array of tag names found for this series
   */
  private async fetchSonarrTagsForItem(
    instanceIds: number[],
    tvdbId: number,
    title: string,
  ): Promise<string[]> {
    for (const instanceId of instanceIds) {
      try {
        const sonarrService =
          this.fastify.sonarrManager.getSonarrService(instanceId)
        if (!sonarrService) {
          this.log.warn(
            `Could not get Sonarr service for instance ${instanceId}`,
          )
          continue
        }

        // Use the targeted lookup to find the series
        const series = await sonarrService.getFromSonarr<
          Array<{ id: number; title: string; tags?: number[] }>
        >(`series/lookup?term=tvdb:${tvdbId}`)

        if (series.length > 0 && series[0].id > 0) {
          const show = series[0]

          if (show.tags && show.tags.length > 0) {
            // Fetch tag definitions to convert IDs to names
            const tagDefinitions = await sonarrService.getTags()
            const tagMap = new Map(
              tagDefinitions.map((tag) => [tag.id, tag.label]),
            )

            const tagNames = show.tags
              .map((tagId: number) => tagMap.get(tagId))
              .filter((tag: string | undefined) => Boolean(tag)) as string[]

            // Filter out user tagging system tags
            const filteredTags = tagNames.filter(
              (tag) => !this.isUserTaggingSystemTag(tag),
            )

            this.log.debug(
              'Found Sonarr tags for series using targeted lookup',
              {
                instanceId,
                tvdbId,
                title,
                seriesTitle: show.title,
                tagIds: show.tags,
                tagNames: filteredTags,
              },
            )

            return filteredTags
          }
        }
      } catch (error) {
        this.log.warn(
          `Error fetching tags from Sonarr instance ${instanceId}:`,
          error,
        )
      }
    }

    return []
  }

  /**
   * Immediately syncs labels for a newly added watchlist item with tag fetching
   * This method attempts to fetch tags from *arr instances and apply them immediately
   *
   * @param watchlistItemId - The watchlist item ID
   * @param title - The content title
   * @param fetchTags - Whether to fetch tags from *arr instances
   * @returns Promise resolving to true if successful, false otherwise (queues for later if not found)
   */
  async syncLabelForNewWatchlistItem(
    watchlistItemId: number,
    title: string,
    fetchTags = true,
  ): Promise<boolean> {
    try {
      // Get the watchlist item details including GUIDs for targeted lookup
      const watchlistItem = await this.db
        .knex('watchlist_items')
        .where('id', watchlistItemId)
        .select('id', 'title', 'key', 'user_id', 'type', 'guids')
        .first()

      if (!watchlistItem) {
        this.log.warn('Watchlist item not found for immediate sync', {
          watchlistItemId,
          title,
        })
        return false
      }

      // Fetch tags if requested and tag sync is enabled
      let tags: string[] = []
      if (fetchTags && this.config.tagSync.enabled) {
        // Use existing GUID utility helpers to extract TMDB/TVDB IDs for targeted lookup
        const tmdbId = extractTmdbId(watchlistItem.guids) || undefined
        const tvdbId = extractTvdbId(watchlistItem.guids) || undefined
        const parsedGuids = parseGuids(watchlistItem.guids)

        // Create enhanced watchlist item object for targeted tag fetching
        const enhancedWatchlistItem = {
          ...watchlistItem,
          guids: parsedGuids,
          tmdbId,
          tvdbId,
        }

        tags = await this.fetchTagsForWatchlistItem(enhancedWatchlistItem)
        this.log.debug(
          'Fetched tags for new watchlist item using targeted approach',
          {
            watchlistItemId,
            title,
            tmdbId,
            tvdbId,
            tagsFound: tags.length,
            tags,
          },
        )
      }

      // Attempt immediate sync with fetched tags
      const success = await this.syncLabelForWatchlistItem(watchlistItem, tags)

      if (!success) {
        // If immediate sync failed, queue for later with the fetched tags
        await this.queuePendingLabelSyncByWatchlistId(
          watchlistItemId,
          title,
          tags,
        )
        this.log.debug(
          'Queued watchlist item with fetched tags for later sync',
          {
            watchlistItemId,
            title,
            tagsQueued: tags.length,
          },
        )
      }

      return success
    } catch (error) {
      this.log.error('Error in immediate sync for new watchlist item:', {
        error,
        watchlistItemId,
        title,
      })

      // Fallback to queuing without tags
      await this.queuePendingLabelSyncByWatchlistId(watchlistItemId, title, [])
      return false
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
      this.log.error({ error }, 'Error syncing label for watchlist item:')
      return false
    }
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
        return webhook.movie.tags.map(String)
      }

      if ('series' in webhook && webhook.series.tags) {
        // Sonarr webhook
        return webhook.series.tags.map(String)
      }

      return []
    } catch (error) {
      this.log.error({ error }, 'Error extracting tags from webhook:')
      return []
    }
  }

  /**
   * Extracts content GUID array and type from webhook payload
   *
   * @param webhook - The webhook payload
   * @returns Object containing GUID array and content type, or null if not extractable
   */
  private extractContentGuidFromWebhook(
    webhook: WebhookPayload,
  ): { guids: string[]; contentType: 'movie' | 'show' } | null {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return null
      }

      if ('movie' in webhook) {
        // Radarr webhook
        return {
          guids: [`tmdb:${webhook.movie.tmdbId}`],
          contentType: 'movie',
        }
      }

      if ('series' in webhook) {
        // Sonarr webhook
        return {
          guids: [`tvdb:${webhook.series.tvdbId}`],
          contentType: 'show',
        }
      }

      return null
    } catch (error) {
      this.log.error({ error }, 'Error extracting content GUID from webhook:')
      return null
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
                // Skip system tracking records (null user_id)
                if (
                  tracking.user_id !== null &&
                  !trackedUsers.has(tracking.user_id)
                ) {
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
              if (!trackedUsers.has(pendingSync.user_id)) {
                const newUser = userMap.get(pendingSync.user_id)
                if (newUser) {
                  trackedUsers.set(pendingSync.user_id, {
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
          this.log.error(
            { error: promiseResult.reason },
            'Error processing pending sync:',
          )
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
      this.log.error({ error }, 'Error processing pending label syncs:')
      throw error
    }
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
      guids: string[]
      contentType: 'movie' | 'show'
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

    const cleanupStartTime = Date.now()
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

        const sortedGuids = [...parsedGuids].sort()
        const contentKey = `${fullItem.type}-${JSON.stringify(sortedGuids)}`
        itemGuidMap.set(item.id, contentKey) // Store mapping for later cleanup

        this.log.debug(
          `Getting tracked labels for content key: ${contentKey} (was looking for raw key: ${item.key}), user_id: ${item.user_id}`,
        )

        const labels = await this.db.getTrackedLabelsForContent(
          parsedGuids,
          fullItem.type as 'movie' | 'show',
        )
        this.log.debug(
          `Found ${labels.length} total tracking records for content key: ${contentKey}`,
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
          `Found ${userLabels.length} user-specific tracking records for content key: ${contentKey}, user_id: ${item.user_id}`,
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
          content_guids: t.content_guids,
          user_id: t.user_id,
          plex_rating_key: t.plex_rating_key,
          labels_applied: t.labels_applied,
        })),
      })

      if (trackedLabels.length === 0) {
        this.log.debug(
          'No tracked labels found for cleanup, skipping Plex API calls',
        )
        // Still need to cleanup tracking records using full GUID arrays
        for (const item of watchlistItems) {
          await this.db.cleanupUserContentTracking(
            item.guids,
            item.contentType,
            item.user_id,
          )
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

      // Clean up tracking records from database using full GUID arrays
      for (const item of watchlistItems) {
        await this.db.cleanupUserContentTracking(
          item.guids,
          item.contentType,
          item.user_id,
        )
      }

      const cleanupDuration = Date.now() - cleanupStartTime
      const successRate =
        trackedLabels.length > 0
          ? (removedCount / trackedLabels.length) * 100
          : 100

      this.log.info(
        `Completed label cleanup for ${watchlistItems.length} deleted watchlist items`,
        {
          trackedLabelsRemoved: trackedLabels.length,
          plexLabelsRemoved: removedCount,
          duration: `${cleanupDuration}ms`,
          successRate: `${successRate.toFixed(1)}%`,
          averageTimePerItem: `${(cleanupDuration / watchlistItems.length).toFixed(1)}ms`,
        },
      )
    } catch (error) {
      this.log.error(
        { error },
        'Error during label cleanup for watchlist items:',
      )
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
    const specialLabelStartTime = Date.now()
    const itemGuidMap = new Map<number, string>() // Map item.id -> primaryGuid
    const itemDataMap = new Map<
      number,
      { guids: string[]; contentType: 'movie' | 'show' }
    >() // Map item.id -> full data

    try {
      // Get all tracked labels for these watchlist items
      const trackedLabels: PlexLabelTracking[] = []

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

        const sortedGuids = [...parsedGuids].sort()
        const contentKey = `${fullItem.type}-${JSON.stringify(sortedGuids)}`
        itemGuidMap.set(item.id, contentKey)
        itemDataMap.set(item.id, {
          guids: parsedGuids,
          contentType: fullItem.type === 'show' ? 'show' : 'movie',
        })

        const labels = await this.db.getTrackedLabelsForContent(
          parsedGuids,
          fullItem.type === 'show' ? 'show' : 'movie',
        )
        // Filter to only this user's labels
        const userLabels = labels.filter(
          (label) => label.user_id === item.user_id,
        )
        trackedLabels.push(...userLabels)
      }

      if (trackedLabels.length === 0) {
        // Clean up tracking records and return
        for (const item of watchlistItems) {
          const itemData = itemDataMap.get(item.id)
          if (itemData) {
            await this.db.cleanupUserContentTracking(
              itemData.guids,
              itemData.contentType,
              item.user_id,
            )
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
                        t.content_guids.includes(fullItem.key) &&
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

                  // Create tracking record for the removed label
                  try {
                    // Find tracking record for this rating key to get content info
                    const trackingRecord = trackedLabels.find(
                      (t) => t.plex_rating_key === ratingKey,
                    )

                    if (trackingRecord) {
                      await this.db.trackPlexLabels(
                        trackingRecord.content_guids,
                        trackingRecord.content_type,
                        null, // System operation for removed labels
                        ratingKey,
                        [removedLabel],
                      )
                      this.log.debug('Successfully tracked removed label', {
                        ratingKey,
                        removedLabel,
                        guids: trackingRecord.content_guids,
                        contentType: trackingRecord.content_type,
                      })
                    } else {
                      this.log.warn(
                        'No tracking record found for rating key during removal tracking',
                        {
                          ratingKey,
                          removedLabel,
                        },
                      )
                    }
                  } catch (trackError) {
                    this.log.error('Failed to track removed label', {
                      error: trackError,
                      ratingKey,
                      removedLabel,
                    })
                  }

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
        const itemData = itemDataMap.get(item.id)
        if (itemData) {
          await this.db.cleanupUserContentTracking(
            itemData.guids,
            itemData.contentType,
            item.user_id,
          )
        }
      }

      const specialLabelDuration = Date.now() - specialLabelStartTime

      this.log.info(
        `Completed special label handling for ${watchlistItems.length} deleted watchlist items`,
        {
          trackedLabelsFound: trackedLabels.length,
          contentItemsProcessed: processedCount,
          duration: `${specialLabelDuration}ms`,
          averageTimePerItem: `${(specialLabelDuration / watchlistItems.length).toFixed(1)}ms`,
        },
      )
    } catch (error) {
      this.log.error(
        'Error during special label handling for deleted watchlist items:',
        error,
      )
      // Still clean up tracking records on error using primary GUIDs
      for (const item of watchlistItems) {
        try {
          // Try to use the already mapped primary GUID first
          const itemData = itemDataMap.get(item.id)
          if (itemData) {
            await this.db.cleanupUserContentTracking(
              itemData.guids,
              itemData.contentType,
              item.user_id,
            )
          } else {
            // Fallback: fetch item and parse GUID if not already mapped
            const fullItem = await this.db.getWatchlistItemById(item.id)
            if (fullItem?.guids) {
              const parsedGuids = parseGuids(fullItem.guids)
              if (parsedGuids.length > 0) {
                await this.db.cleanupUserContentTracking(
                  parsedGuids,
                  fullItem.type === 'show' ? 'show' : 'movie',
                  item.user_id,
                )
              }
            }
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
   * @returns Promise resolving to removal results
   */
  async removeAllLabels(): Promise<{
    processed: number
    removed: number
    failed: number
  }> {
    if (!this.config.enabled) {
      this.log.debug('Plex label sync is disabled, skipping label removal')
      return { processed: 0, removed: 0, failed: 0 }
    }

    const operationId = `plex-label-removal-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    const result = {
      processed: 0,
      removed: 0,
      failed: 0,
    }

    try {
      this.log.info('Starting bulk Plex label removal')

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-removal',
          phase: 'start',
          progress: 5,
          message: 'Starting Plex label removal...',
        })
      }

      // Get all tracked labels from database
      const trackedLabels = await this.db.getAllTrackedLabels()
      this.log.info(`Found ${trackedLabels.length} tracked labels to process`)

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-removal',
          phase: 'fetching-data',
          progress: 15,
          message: `Found ${trackedLabels.length} tracked labels to process`,
        })
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

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-removal',
          phase: 'processing-content',
          progress: 25,
          message: `Processing ${labelsByRatingKey.size} items`,
        })
      }

      // Process label removal in parallel with configurable concurrency limit
      const concurrencyLimit = this.config.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)
      let processedCount = 0
      const ratingKeyEntries = Array.from(labelsByRatingKey.entries())
      const successfulCleanupOperations: Array<{
        plexRatingKey: string
        labelsToRemove: string[]
      }> = []

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
              if (emitProgress && ratingKeyEntries.length > 0) {
                const processProgress =
                  25 +
                  Math.floor((processedCount / ratingKeyEntries.length) * 65)
                this.fastify.progress.emit({
                  operationId,
                  type: 'plex-label-removal',
                  phase: 'processing-content',
                  progress: processProgress,
                  message: `Processing item ${processedCount}/${ratingKeyEntries.length}`,
                })
              }

              // Get current labels and remove only Pulsarr-created labels
              const metadata = await this.plexServer.getMetadata(ratingKey)
              const currentLabels =
                metadata?.Label?.map((label) => label.tag) || []

              this.log.debug(
                `Found ${currentLabels.length} current labels for rating key ${ratingKey}`,
                { currentLabels, labelsToRemove: labels },
              )

              // If we have current labels, filter out all Pulsarr-managed labels (tracked + untracked)
              if (currentLabels.length > 0) {
                // Remove all managed labels (user labels + tag labels + removed markers)
                const filteredLabels = currentLabels.filter(
                  (label) => !this.isManagedLabel(label),
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

                  // Collect successful operations for bulk cleanup
                  successfulCleanupOperations.push({
                    plexRatingKey: ratingKey,
                    labelsToRemove: labels,
                  })

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
                // Use the removeSpecificLabels method and include potential removed markers
                this.log.warn(
                  `No current labels found via API for rating key ${ratingKey}, but tracking table indicates ${labels.length} labels should exist. Attempting removal including untracked removed markers.`,
                  { trackedLabels: labels },
                )

                // Include potential removed markers that might not be tracked
                const labelsWithRemoved = Array.from(
                  new Set([...labels, this.removedLabelPrefix]),
                )
                const success = await this.plexServer.removeSpecificLabels(
                  ratingKey,
                  labelsWithRemoved,
                )

                if (success) {
                  itemResult.removed += labelsWithRemoved.length

                  // Collect successful operations for bulk cleanup
                  successfulCleanupOperations.push({
                    plexRatingKey: ratingKey,
                    labelsToRemove: labelsWithRemoved,
                  })

                  this.log.debug(
                    `Successfully removed ${labelsWithRemoved.length} labels (${labels.length} tracked + removed markers) using fallback method`,
                    {
                      ratingKey,
                      trackedLabels: labels,
                      allLabelsRemoved: labelsWithRemoved,
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

      // Execute bulk cleanup for successfully removed labels
      if (successfulCleanupOperations.length > 0) {
        this.log.debug(
          `Executing bulk cleanup for ${successfulCleanupOperations.length} operations`,
        )
        try {
          const cleanupResult = await this.db.removeTrackedLabels(
            successfulCleanupOperations,
          )
          this.log.debug(
            `Bulk cleanup completed: ${cleanupResult.processedCount} successful, ${cleanupResult.failedIds.length} failed`,
            {
              successfulCount: cleanupResult.processedCount,
              failedIds: cleanupResult.failedIds,
            },
          )
          if (cleanupResult.failedIds.length > 0) {
            this.log.warn(
              `Some tracking cleanup operations failed for rating keys: ${cleanupResult.failedIds.join(', ')}`,
            )
          }
        } catch (cleanupError) {
          this.log.warn('Bulk tracking cleanup failed:', cleanupError)
        }
      }

      // Clean up tracking records from database
      await this.db.clearAllLabelTracking()

      this.log.info('Bulk Plex label removal completed', result)

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-removal',
          phase: 'complete',
          progress: 100,
          message: `Completed Plex label removal: removed ${result.removed} labels from ${result.processed} items, ${result.failed} failed`,
        })
      }

      return result
    } catch (error) {
      this.log.error({ error }, 'Error in bulk Plex label removal:')

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-removal',
          phase: 'error',
          progress: 100,
          message: `Error removing Plex labels: ${error}`,
        })
      }

      throw error
    }
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
      const successfulOrphanedOperations: Array<{
        plexRatingKey: string
        orphanedLabels: string[]
      }> = []

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
                // No labels exist, collect tracking cleanup operation
                successfulOrphanedOperations.push({
                  plexRatingKey: plex_rating_key,
                  orphanedLabels: orphaned_labels,
                })
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
                  // Collect successful operations for bulk cleanup
                  successfulOrphanedOperations.push({
                    plexRatingKey: plex_rating_key,
                    orphanedLabels: orphaned_labels,
                  })

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
              // Labels were already removed externally, collect tracking cleanup operation
              successfulOrphanedOperations.push({
                plexRatingKey: plex_rating_key,
                orphanedLabels: orphaned_labels,
              })
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

      // Execute bulk orphaned tracking cleanup for successful operations
      if (successfulOrphanedOperations.length > 0) {
        this.log.debug(
          `Executing bulk orphaned tracking cleanup for ${successfulOrphanedOperations.length} operations`,
        )
        try {
          const orphanedCleanupResult =
            await this.db.removeOrphanedTrackingBulk(
              successfulOrphanedOperations,
            )
          this.log.debug(
            `Bulk orphaned tracking cleanup completed: ${orphanedCleanupResult.processedCount} successful, ${orphanedCleanupResult.failedIds.length} failed`,
            {
              successfulCount: orphanedCleanupResult.processedCount,
              failedIds: orphanedCleanupResult.failedIds,
            },
          )
          if (orphanedCleanupResult.failedIds.length > 0) {
            this.log.warn(
              `Some orphaned tracking cleanup operations failed for rating keys: ${orphanedCleanupResult.failedIds.join(', ')}`,
            )
          }
        } catch (orphanedCleanupError) {
          this.log.warn(
            'Bulk orphaned tracking cleanup failed:',
            orphanedCleanupError,
          )
        }
      }

      this.log.info('Orphaned Plex label cleanup completed', {
        processedItems: orphanedLabelGroups.length,
        removedLabels: result.removed,
        failedLabels: result.failed,
      })

      return result
    } catch (error) {
      this.log.error({ error }, 'Error during orphaned label cleanup:')
      return { removed: 0, failed: 1 }
    }
  }

  /**
   * Reset Plex labels and tracking table based on current removal mode settings.
   * Accepts watchlist items as parameter OR compiles existing watchlist if called standalone.
   * Reuses existing cleanup logic to handle all removal modes (remove/keep/special-label).
   *
   * @param watchlistItems - Optional array of watchlist items to process. If not provided, all watchlist items are fetched.
   * @returns Promise resolving to processing results
   */
  async resetLabels(
    watchlistItems?: Array<{
      id: string | number
      user_id: number
      guids?: string[] | string
      title: string
      type?: string
      key: string | null
    }>,
  ): Promise<{ processed: number; updated: number; failed: number }> {
    if (!this.config.enabled) {
      this.log.warn('Plex label sync is disabled, skipping label reset')
      return { processed: 0, updated: 0, failed: 0 }
    }

    const operationId = `plex-label-reset-${Date.now()}`
    const emitProgress = this.fastify.progress.hasActiveConnections()

    try {
      this.log.info('Starting Plex label reset based on current removal mode', {
        mode: this.removedLabelMode,
        providedItems: watchlistItems?.length || 0,
      })

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'start',
          progress: 5,
          message: 'Starting Plex label reset...',
        })
      }

      // Step 1: Get watchlist items (compile if not provided, same pattern as syncAllLabels)
      let items = watchlistItems
      if (!items) {
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'fetching-data',
            progress: 10,
            message: 'Fetching all watchlist items...',
          })
        }
        const [movieItems, showItems] = await Promise.all([
          this.db.getAllMovieWatchlistItems(),
          this.db.getAllShowWatchlistItems(),
        ])
        items = [...movieItems, ...showItems]
        this.log.info(`Compiled ${items.length} watchlist items for reset`)
      }

      if (items.length === 0) {
        this.log.info('No watchlist items to process for reset')
        return { processed: 0, updated: 0, failed: 0 }
      }

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'processing-content',
          progress: 25,
          message: `Processing ${items.length} watchlist items with mode: ${this.removedLabelMode}...`,
        })
      }

      // Step 2: Find orphaned tracking entries (tracking entries without corresponding watchlist items)
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'processing-content',
          progress: 30,
          message: 'Finding orphaned tracking entries...',
        })
      }

      // Get all tracking entries using the proper database method
      const allTrackingEntries = await this.db.getAllTrackedLabels()

      // Find orphaned tracking entries using weighted GUID matching
      const orphanedEntries = []
      for (const trackingEntry of allTrackingEntries) {
        let foundMatch = false

        // Check if this tracking entry matches any current watchlist item
        for (const watchlistItem of items) {
          // Only compare items from the same user and content type
          if (trackingEntry.user_id !== watchlistItem.user_id) {
            continue
          }

          const watchlistItemType = watchlistItem.type || 'movie'
          if (trackingEntry.content_type !== watchlistItemType) {
            continue
          }

          const watchlistGuids = parseGuids(watchlistItem.guids)
          const trackingGuids = trackingEntry.content_guids

          // Check if tracking entry contains real content GUIDs or just rating key
          const trackingContainsRealGuids = trackingGuids.some((guid) =>
            guid.includes(':'),
          )

          let matchScore = 0

          if (trackingContainsRealGuids) {
            // Use weighted GUID matching for real GUIDs
            matchScore = getGuidMatchScore(trackingGuids, watchlistGuids)
          } else {
            // Tracking entry only has rating key, check if watchlist item has the same key
            if (
              watchlistItem.key &&
              trackingGuids.includes(watchlistItem.key)
            ) {
              // This is a fallback match - assign score of 1
              matchScore = 1
            }
          }

          if (matchScore > 0) {
            foundMatch = true
            this.log.debug(
              `Tracking entry matched watchlist item "${watchlistItem.title}" (score: ${matchScore}, method: ${trackingContainsRealGuids ? 'GUID' : 'rating-key'})`,
              {
                trackingId: trackingEntry.id,
                ratingKey: trackingEntry.plex_rating_key,
                trackingGuids,
                watchlistGuids,
                trackingContainsRealGuids,
              },
            )
            break
          }
        }

        // If no match found, this tracking entry is orphaned
        if (!foundMatch) {
          orphanedEntries.push({
            id: trackingEntry.id, // This will be unused but required by interface
            title: 'Orphaned Item', // Title is not available in tracking table
            key: '', // Key is not needed for cleanup
            user_id: trackingEntry.user_id,
            guids: trackingEntry.content_guids,
            contentType: trackingEntry.content_type as 'movie' | 'show',
            trackingId: trackingEntry.id, // Keep reference to tracking entry ID
            plexRatingKey: trackingEntry.plex_rating_key,
            labelsApplied: trackingEntry.labels_applied,
          })
        }
      }

      if (orphanedEntries.length === 0) {
        this.log.info('No orphaned tracking entries found')
        if (emitProgress) {
          this.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'complete',
            progress: 100,
            message: 'Reset complete - no orphaned entries found',
          })
        }
        return { processed: items.length, updated: 0, failed: 0 }
      }

      this.log.info(
        `Found ${orphanedEntries.length} orphaned tracking entries to clean up`,
      )
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'cleanup',
          progress: 50,
          message: `Cleaning up ${orphanedEntries.length} orphaned entries...`,
        })
      }

      // Step 3: Process orphaned entries based on removal mode
      let processedCount = 0
      let failedCount = 0

      if (this.removedLabelMode === 'keep') {
        this.log.info(
          'Removal mode is "keep", preserving orphaned labels and tracking entries',
        )
        // In keep mode, we don't remove anything
        processedCount = orphanedEntries.length
      } else if (this.removedLabelMode === 'remove') {
        // Remove labels from Plex and delete tracking entries
        for (const entry of orphanedEntries) {
          try {
            // Remove labels from Plex
            if (entry.labelsApplied.length > 0) {
              await this.plexServer.removeSpecificLabels(
                entry.plexRatingKey,
                entry.labelsApplied,
              )
            }

            // Delete tracking entry using proper database method
            await this.db.cleanupUserContentTracking(
              entry.guids,
              entry.contentType,
              entry.user_id,
            )

            processedCount++
          } catch (error) {
            this.log.error(
              `Failed to clean up orphaned entry for rating key ${entry.plexRatingKey}:`,
              error,
            )
            failedCount++
          }
        }
      } else if (this.removedLabelMode === 'special-label') {
        // Replace existing labels with special "removed" label
        for (const entry of orphanedEntries) {
          try {
            // Remove existing labels and apply special removed label
            const removedLabel = this.removedLabelPrefix || 'pulsarr:removed'
            await this.plexServer.updateLabels(entry.plexRatingKey, [
              removedLabel,
            ])

            // Update tracking entry using proper database method
            await this.db.trackPlexLabels(
              entry.guids,
              entry.contentType,
              entry.user_id,
              entry.plexRatingKey,
              [removedLabel],
            )

            processedCount++
          } catch (error) {
            this.log.error(
              `Failed to apply special label to orphaned entry for rating key ${entry.plexRatingKey}:`,
              error,
            )
            failedCount++
          }
        }
      }

      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'complete',
          progress: 100,
          message: 'Reset complete',
        })
      }

      this.log.info('Plex label reset completed successfully', {
        mode: this.removedLabelMode,
        orphanedEntriesFound: orphanedEntries.length,
        orphanedEntriesProcessed: processedCount,
        orphanedEntriesFailed: failedCount,
      })

      return {
        processed: orphanedEntries.length,
        updated: processedCount,
        failed: failedCount,
      }
    } catch (error) {
      this.log.error({ error }, 'Error during Plex label reset:')
      if (emitProgress) {
        this.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'error',
          progress: 100,
          message: 'Reset failed',
        })
      }
      throw error
    }
  }
}
