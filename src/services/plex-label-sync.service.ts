/**
 * Plex Label Sync Service
 *
 * Handles synchronization of Plex labels based on user watchlists and content requests.
 * Supports both webhook-triggered real-time syncing and scheduled batch processing.
 *
 * Key Features:
 * - Webhook-triggered label updates (real-time)
 * - Batch synchronization of all content with parallel processing
 * - Retry logic with exponential backoff
 * - Pending sync queue for items not yet available in Plex
 * - User label management with configurable format
 * - Content GUID matching and resolution
 * - Configurable concurrency control for optimal performance
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexServerService } from '@utils/plex-server.js'
import type { DatabaseService } from './database.service.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import pLimit from 'p-limit'
import {
  parseGuids,
  hasMatchingGuids,
  normalizeGuid,
} from '@utils/guid-handler.js'

/**
 * Represents a pending label sync item
 */
interface PendingLabelSync {
  id?: number
  guid: string
  content_title: string
  retry_count: number
  last_retry_at?: Date | null
  created_at: Date
  expires_at: Date
}

/**
 * Result object for sync operations
 */
interface SyncResult {
  processed: number
  updated: number
  failed: number
  pending: number
}

/**
 * Watchlist content grouped by GUID
 */
interface GroupedWatchlistContent {
  guid: string
  title: string
  users: Array<{
    user_id: number
    username: string
    watchlist_id: number
  }>
}

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
   * @param config - Configuration for label sync behavior
   */
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly plexServer: PlexServerService,
    private readonly db: DatabaseService,
    private readonly config: PlexLabelSyncConfig,
  ) {
    this.log.info('Initializing PlexLabelSyncService', {
      enabled: config.enabled,
      labelFormat: config.labelFormat,
    })
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

      this.log.debug('Extracted content GUID from webhook', {
        guid: contentGuid,
        instanceName: webhook.instanceName,
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
            },
          )
          await this.queuePendingLabelSyncByWatchlistId(
            Number(item.id),
            item.title,
          )
          continue
        }

        const success = await this.syncLabelForWatchlistItem(item)
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
   * Synchronizes all labels for all content in batch mode
   * This processes all watchlist items and applies appropriate labels
   *
   * @param progressCallback - Optional callback to report progress for SSE
   * @returns Promise resolving to sync results
   */
  async syncAllLabels(
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<SyncResult> {
    this.log.info('Manual batch label sync requested', {
      enabled: this.config.enabled,
      labelFormat: this.config.labelFormat,
    })

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
      this.log.info('Starting batch label synchronization')
      progressCallback?.(5, 'Starting Plex label synchronization...')

      // Get all active watchlist items from database
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
          sampleMovieItems: movieItems.slice(0, 3).map((item) => ({
            id: item.id,
            title: item.title,
            plex_key: item.key,
            user_id: item.user_id,
          })),
          sampleShowItems: showItems.slice(0, 3).map((item) => ({
            id: item.id,
            title: item.title,
            plex_key: item.key,
            user_id: item.user_id,
          })),
        },
      )

      if (watchlistItems.length === 0) {
        this.log.warn(
          'No watchlist items found in database - this might indicate an empty watchlist table',
        )
        progressCallback?.(100, 'No content found to label')
        return result
      }

      progressCallback?.(
        15,
        `Found ${watchlistItems.length} watchlist items to process`,
      )

      // Filter items that have Plex keys vs those that need to be queued
      const itemsWithKeys: typeof watchlistItems = []
      const itemsWithoutKeys: typeof watchlistItems = []

      for (const item of watchlistItems) {
        if (item.key) {
          itemsWithKeys.push(item)
        } else {
          itemsWithoutKeys.push(item)
          // Queue items without Plex keys for pending sync
          await this.queuePendingLabelSyncByWatchlistId(
            Number(item.id),
            item.title,
          )
        }
      }

      this.log.info(
        `Plex key analysis: ${itemsWithKeys.length} items with keys, ${itemsWithoutKeys.length} without keys (queued for pending sync)`,
        {
          itemsWithKeys: itemsWithKeys.length,
          itemsWithoutKeys: itemsWithoutKeys.length,
          sampleItemsWithKeys: itemsWithKeys.slice(0, 3).map((item) => ({
            id: item.id,
            title: item.title,
            plex_key: item.key,
          })),
        },
      )

      if (itemsWithKeys.length === 0) {
        this.log.warn(
          'No watchlist items have Plex keys - all items have been queued for pending sync',
        )
        progressCallback?.(
          100,
          'No content with Plex keys found - all items queued for pending sync',
        )
        result.pending = itemsWithoutKeys.length
        return result
      }

      progressCallback?.(
        25,
        `Processing ${itemsWithKeys.length} items with Plex keys using direct access`,
      )

      // Process watchlist items directly using Plex keys with parallel processing
      const concurrencyLimit = this.config.concurrencyLimit || 5
      this.log.info(
        `Starting parallel processing of ${itemsWithKeys.length} watchlist items with concurrency limit of ${concurrencyLimit}`,
      )

      const limit = pLimit(concurrencyLimit)
      let processedCount = 0

      const itemProcessingResults = await Promise.allSettled(
        itemsWithKeys.map((item) =>
          limit(async () => {
            const itemResult = {
              processed: 0,
              updated: 0,
              failed: 0,
              pending: 0,
            }

            try {
              itemResult.processed++
              processedCount++

              // Report progress during processing
              if (itemsWithKeys.length > 0) {
                const processProgress =
                  25 + Math.floor((processedCount / itemsWithKeys.length) * 65)
                progressCallback?.(
                  processProgress,
                  `Processing item ${processedCount}/${itemsWithKeys.length}: ${item.title}`,
                )
              }

              // Sync label directly using Plex key
              const success = await this.syncLabelForWatchlistItem(item)

              this.log.debug('Direct Plex key label sync completed', {
                itemId: item.id,
                title: item.title,
                plexKey: item.key,
                userId: item.user_id,
                success,
              })

              if (success) {
                itemResult.updated++
              } else {
                itemResult.failed++
              }
            } catch (error) {
              this.log.error(
                `Error processing watchlist item ${item.id}:`,
                error,
              )
              itemResult.failed++
            }

            return itemResult
          }),
        ),
      )

      // Aggregate results from parallel processing
      for (const promiseResult of itemProcessingResults) {
        if (promiseResult.status === 'fulfilled') {
          const itemResult = promiseResult.value
          result.processed += itemResult.processed
          result.updated += itemResult.updated
          result.failed += itemResult.failed
          result.pending += itemResult.pending
        } else {
          this.log.error(
            'Promise rejected during parallel item processing:',
            promiseResult.reason,
          )
          result.failed++
        }
      }

      // Get accurate pending count from database (includes items without keys + items with keys not found in Plex)
      const pendingSyncs = await this.db.getPendingLabelSyncs()
      result.pending = pendingSyncs.length

      this.log.info(
        `Parallel processing completed: ${result.processed} processed, ${result.updated} updated, ${result.failed} failed, ${result.pending} pending`,
      )

      this.log.info('Batch label synchronization completed', result)
      progressCallback?.(
        100,
        `Completed Plex label sync: updated ${result.updated} items, failed ${result.failed}, pending ${result.pending}`,
      )
      return result
    } catch (error) {
      this.log.error('Error in batch label synchronization:', error)
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
      const success = await this.applyUserLabelsToSingleItem(ratingKey, users)
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

      // Always preserve existing labels (removed config option)
      const metadata = await this.plexServer.getMetadata(ratingKey)
      if (metadata?.Label) {
        existingLabels = metadata.Label.map((label) => label.tag)
      }

      // Generate user labels based on configured format
      const userLabels = users.map((user) =>
        this.config.labelFormat.replace('{username}', user.username),
      )

      // Combine existing labels with new user labels
      const allLabels = [...new Set([...existingLabels, ...userLabels])]

      this.log.debug('Applying labels to Plex item', {
        ratingKey,
        existingLabels,
        userLabels,
        finalLabels: allLabels,
      })

      // Update the labels in Plex
      const success = await this.plexServer.updateLabels(ratingKey, allLabels)

      if (success) {
        this.log.debug(`Successfully updated labels for item ${ratingKey}`, {
          labelCount: allLabels.length,
          userCount: users.length,
        })

        // Track each applied user label in the database for cleanup purposes
        let trackingErrors = 0
        for (const user of users) {
          const userLabel = this.config.labelFormat.replace(
            '{username}',
            user.username,
          )
          try {
            await this.db.trackPlexLabel(
              user.watchlist_id,
              ratingKey,
              userLabel,
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
   * Adds watchlist item to the pending sync queue for later processing
   *
   * @param watchlistItemId - The watchlist item ID
   * @param title - The content title for human readability
   */
  private async queuePendingLabelSyncByWatchlistId(
    watchlistItemId: number,
    title: string,
  ): Promise<void> {
    try {
      await this.db.createPendingLabelSync(
        watchlistItemId,
        title,
        30, // 30 minute default expiration
      )

      this.log.debug('Added watchlist item to pending label sync queue', {
        watchlistItemId,
        title,
      })
    } catch (error) {
      this.log.error('Error queuing pending label sync:', error)
    }
  }

  /**
   * Syncs labels for a single watchlist item by resolving GUID to rating key
   *
   * @param watchlistItem - The watchlist item with GUID part in key field
   * @returns Promise resolving to true if successful, false otherwise
   */
  private async syncLabelForWatchlistItem(watchlistItem: {
    id: string | number
    title: string
    key: string | null
    user_id: number
    type?: string
  }): Promise<boolean> {
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
        )

        return false
      }

      // Apply labels to all found items (handles multiple versions)
      let allSuccessful = true
      for (const plexItem of plexItems) {
        this.log.debug('Applying label to Plex item', {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
          ratingKey: plexItem.ratingKey,
          plexTitle: plexItem.title,
        })

        const success = await this.applyUserLabelsToSingleItem(
          plexItem.ratingKey,
          [
            {
              user_id: watchlistItem.user_id,
              username,
              watchlist_id: Number(watchlistItem.id),
            },
          ],
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
      const pendingSyncs = await this.db.getPendingLabelSyncsWithPlexKeys()

      // Only log if there are pending syncs to process
      if (pendingSyncs.length > 0) {
        this.log.info(`Processing ${pendingSyncs.length} pending label syncs`)
      }

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

              // Apply labels to all found items
              let allSuccessful = true
              for (const plexItem of plexItems) {
                const success = await this.applyUserLabelsToSingleItem(
                  plexItem.ratingKey,
                  [
                    {
                      user_id: pendingSync.user_id,
                      username,
                      watchlist_id: pendingSync.watchlist_item_id,
                    },
                  ],
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

      // Aggregate results from parallel processing
      for (const promiseResult of pendingProcessingResults) {
        if (promiseResult.status === 'fulfilled') {
          const syncResult = promiseResult.value
          result.processed += syncResult.processed
          result.updated += syncResult.updated
          result.failed += syncResult.failed
          result.pending += syncResult.pending
        } else {
          this.log.error(
            'Promise rejected during parallel pending sync processing:',
            promiseResult.reason,
          )
          result.failed++
        }
      }

      // Clean up expired pending syncs
      const expiredCount = await this.db.expirePendingLabelSyncs()

      if (expiredCount > 0) {
        this.log.info(`Cleaned up ${expiredCount} expired pending syncs`)
      }

      // Only log completion if we actually processed something
      if (result.processed > 0) {
        this.log.info('Completed processing pending label syncs', result)
      }
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
   * It fetches tracking records for the given watchlist items and removes the
   * corresponding labels from Plex content.
   *
   * @param watchlistItems - Array of watchlist items that are being deleted
   */
  async cleanupLabelsForWatchlistItems(
    watchlistItems: Array<{ id: number; title?: string }>,
  ): Promise<void> {
    if (!this.config.enabled || watchlistItems.length === 0) {
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
      // Get all tracked labels for these watchlist items
      const trackedLabels = []
      for (const item of watchlistItems) {
        const labels = await this.db.getTrackedLabelsForWatchlist(item.id)
        trackedLabels.push(...labels)
      }

      this.log.debug(`Found ${trackedLabels.length} tracked labels to remove`)

      // Group by rating key to batch operations
      const labelsByRatingKey = new Map<string, string[]>()
      for (const tracking of trackedLabels) {
        const labels = labelsByRatingKey.get(tracking.plex_rating_key) || []
        labels.push(tracking.label_applied)
        labelsByRatingKey.set(tracking.plex_rating_key, labels)
      }

      // Remove labels from Plex content with parallel processing
      const concurrencyLimit = this.config.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)
      let removedCount = 0

      const labelRemovalResults = await Promise.allSettled(
        Array.from(labelsByRatingKey.entries()).map(([ratingKey, labels]) =>
          limit(async () => {
            try {
              await this.plexServer.removeLabels(ratingKey, labels)
              this.log.debug(
                `Removed ${labels.length} labels from Plex content`,
                {
                  ratingKey,
                  labels,
                },
              )
              return labels.length
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

      // Clean up tracking records from database
      for (const item of watchlistItems) {
        await this.db.cleanupWatchlistTracking(item.id)
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
        const labels = labelsByRatingKey.get(tracking.plex_rating_key) || []
        labels.push(tracking.label_applied)
        labelsByRatingKey.set(tracking.plex_rating_key, labels)
      }

      progressCallback?.(
        25,
        `Processing ${labelsByRatingKey.size} items with parallel processing`,
      )

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
              const filteredLabels = currentLabels.filter(
                (label) => !labels.includes(label),
              )
              await this.plexServer.updateLabels(ratingKey, filteredLabels)
              itemResult.removed += labels.length

              this.log.debug(
                `Removed ${labels.length} Pulsarr labels from Plex content`,
                {
                  ratingKey,
                  labels,
                },
              )
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

      // Aggregate results from parallel processing
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
}
