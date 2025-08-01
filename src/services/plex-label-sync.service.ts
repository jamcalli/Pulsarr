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
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexServerService } from '@utils/plex-server.js'
import type { DatabaseService } from './database.service.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
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
      liveMode: config.liveMode,
      batchMode: config.batchMode,
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
    if (!this.config.enabled || !this.config.liveMode) {
      this.log.debug('Webhook label sync is disabled, skipping')
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

      // Find all Plex items with retry logic
      const plexItems = await this.findPlexItemsWithRetry(contentGuid, 5)
      if (plexItems.length === 0) {
        this.log.info('Content not found in Plex, queuing for pending sync', {
          guid: contentGuid,
          title: this.getContentTitleFromWebhook(webhook),
        })

        await this.queuePendingLabelSync(
          contentGuid,
          this.getContentTitleFromWebhook(webhook),
        )
        return false
      }

      // Get all users with this content in their watchlist
      const watchlistUsers = await this.getUsersWithContent(contentGuid)
      if (watchlistUsers.length === 0) {
        this.log.debug('No users have this content in their watchlist', {
          guid: contentGuid,
          itemCount: plexItems.length,
          ratingKeys: plexItems.map((item) => item.ratingKey),
        })
        return true
      }

      // Determine which items to label based on configuration
      const itemsToLabel = this.selectItemsForLabeling(plexItems)
      const ratingKeys = itemsToLabel.map((item) => item.ratingKey)

      // Apply user labels to all selected Plex items
      const success = await this.applyUserLabels(ratingKeys, watchlistUsers)

      this.log.info('Webhook label sync completed', {
        guid: contentGuid,
        totalItems: plexItems.length,
        labeledItems: itemsToLabel.length,
        ratingKeys,
        userCount: watchlistUsers.length,
        success,
      })

      return success
    } catch (error) {
      this.log.error('Error processing webhook for label sync:', error)
      return false
    }
  }

  /**
   * Synchronizes all labels for all content in batch mode
   * This processes all watchlist items and applies appropriate labels
   *
   * @returns Promise resolving to sync results
   */
  async syncAllLabels(): Promise<SyncResult> {
    if (!this.config.enabled || !this.config.batchMode) {
      this.log.debug('Batch label sync is disabled, skipping')
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

      // Get all active watchlist items from database
      const [movieItems, showItems] = await Promise.all([
        this.db.getAllMovieWatchlistItems(),
        this.db.getAllShowWatchlistItems(),
      ])
      const watchlistItems = [...movieItems, ...showItems]
      this.log.info(`Found ${watchlistItems.length} watchlist items to process`)

      // Group by content GUID to avoid duplicate API calls
      const groupedContent = await this.groupByContentGuid(watchlistItems)
      this.log.info(
        `Grouped into ${groupedContent.length} unique content items`,
      )

      // Process each unique content item
      for (const contentGroup of groupedContent) {
        try {
          result.processed++

          // Find all Plex items
          const plexItems = await this.findPlexItemsWithRetry(
            contentGroup.guid,
            3,
          )
          if (plexItems.length === 0) {
            this.log.debug(
              'Content not found in Plex, queuing for pending sync',
              {
                guid: contentGroup.guid,
                title: contentGroup.title,
              },
            )

            await this.queuePendingLabelSync(
              contentGroup.guid,
              contentGroup.title,
            )
            result.pending++
            continue
          }

          // Determine which items to label based on configuration
          const itemsToLabel = this.selectItemsForLabeling(plexItems)
          const ratingKeys = itemsToLabel.map((item) => item.ratingKey)

          // Apply user labels
          const success = await this.applyUserLabels(
            ratingKeys,
            contentGroup.users,
          )

          if (success) {
            result.updated++
          } else {
            result.failed++
          }
        } catch (error) {
          this.log.error(
            `Error processing content group for GUID ${contentGroup.guid}:`,
            error,
          )
          result.failed++
        }
      }

      this.log.info('Batch label synchronization completed', result)
      return result
    } catch (error) {
      this.log.error('Error in batch label synchronization:', error)
      throw error
    }
  }

  /**
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
   *
   * @param ratingKey - The Plex rating key of the item
   * @param users - Array of users who have this content
   * @returns Promise resolving to true if successful, false otherwise
   */
  private async applyUserLabelsToSingleItem(
    ratingKey: string,
    users: Array<{ user_id: number; username: string }>,
  ): Promise<boolean> {
    try {
      // Get current item metadata to preserve existing labels
      let existingLabels: string[] = []

      if (this.config.preserveExistingLabels) {
        const metadata = await this.plexServer.getMetadata(ratingKey)
        if (metadata?.Label) {
          existingLabels = metadata.Label.map((label) => label.tag)
        }
      }

      // Generate user labels based on configured format
      const userLabels = users.map((user) =>
        this.config.labelFormat.replace('{username}', user.username),
      )

      // Filter out excluded labels
      const filteredExistingLabels = existingLabels.filter(
        (label) => !this.config.excludeLabels.includes(label),
      )

      // Combine existing labels with new user labels
      const allLabels = [...new Set([...filteredExistingLabels, ...userLabels])]

      this.log.debug('Applying labels to Plex item', {
        ratingKey,
        existingLabels: filteredExistingLabels,
        userLabels,
        finalLabels: allLabels,
      })

      // Update the labels in Plex
      const success = await this.plexServer.updateLabels(ratingKey, allLabels)

      if (success) {
        this.log.info(`Successfully updated labels for item ${ratingKey}`, {
          labelCount: allLabels.length,
          userCount: users.length,
        })
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
   * Adds content to the pending sync queue for later processing
   *
   * @param guid - The content GUID
   * @param title - The content title for human readability
   */
  private async queuePendingLabelSync(
    guid: string,
    title: string,
  ): Promise<void> {
    try {
      const expiresAt = new Date()
      expiresAt.setMinutes(expiresAt.getMinutes() + this.config.pendingMaxAge)

      const pendingSync: Omit<PendingLabelSync, 'id' | 'created_at'> = {
        guid,
        content_title: title,
        retry_count: 0,
        last_retry_at: null,
        expires_at: expiresAt,
      }

      // Check if already exists to avoid duplicates
      const existing = await this.db
        .knex('pending_label_syncs')
        .where({ guid })
        .first()

      if (!existing) {
        await this.db.knex('pending_label_syncs').insert(pendingSync)
        this.log.debug('Added content to pending label sync queue', {
          guid,
          title,
          expiresAt,
        })
      } else {
        this.log.debug('Content already in pending label sync queue', {
          guid,
          title,
        })
      }
    } catch (error) {
      this.log.error('Error queuing pending label sync:', error)
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
    const userIds = [...new Set(watchlistItems.map(item => item.user_id))]
    
    // Fetch actual usernames
    const users = await this.db.knex('users')
      .whereIn('id', userIds)
      .select('id', 'name')
    
    const userMap = new Map(users.map(user => [user.id, user.name || `user_${user.id}`]))

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
      // Use the proper database method to get watchlist items by GUID
      const watchlistItems = await this.db.getWatchlistItemsByGuid(guid)

      if (watchlistItems.length === 0) {
        return []
      }

      // Get unique user IDs and fetch user information
      const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]
      const users = await this.db
        .knex('users')
        .whereIn('id', userIds)
        .select('id', 'name')

      // Create a map for quick user lookup
      const userMap = new Map(
        users.map((user) => [user.id, user.name || `user_${user.id}`]),
      )

      // Return combined information with watchlist IDs
      return watchlistItems.map((item) => ({
        user_id: item.user_id,
        username: userMap.get(item.user_id) || `user_${item.user_id}`,
        watchlist_id: Number(item.id), // Convert string ID to number for tracking
      }))
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
      this.log.info('Processing pending label syncs')

      // Get pending syncs that haven't expired
      const pendingSyncs = await this.db
        .knex('pending_label_syncs')
        .where('expires_at', '>', new Date())
        .orderBy('created_at', 'asc')

      this.log.info(
        `Found ${pendingSyncs.length} pending label syncs to process`,
      )

      for (const pendingSync of pendingSyncs) {
        try {
          result.processed++

          // Try to find all items in Plex
          const plexItems = await this.findPlexItemsWithRetry(
            pendingSync.guid,
            2,
          )
          if (plexItems.length === 0) {
            // Update retry count
            await this.db
              .knex('pending_label_syncs')
              .where({ id: pendingSync.id })
              .update({
                retry_count: pendingSync.retry_count + 1,
                last_retry_at: new Date(),
              })

            result.pending++
            continue
          }

          // Get users with this content
          const users = await this.getUsersWithContent(pendingSync.guid)
          if (users.length === 0) {
            // Remove from pending queue if no users have it
            await this.db
              .knex('pending_label_syncs')
              .where({ id: pendingSync.id })
              .delete()
            continue
          }

          // Determine which items to label based on configuration
          const itemsToLabel = this.selectItemsForLabeling(plexItems)
          const ratingKeys = itemsToLabel.map((item) => item.ratingKey)

          // Apply labels
          const success = await this.applyUserLabels(ratingKeys, users)

          if (success) {
            // Remove from pending queue
            await this.db
              .knex('pending_label_syncs')
              .where({ id: pendingSync.id })
              .delete()

            result.updated++
            this.log.info('Successfully processed pending sync', {
              guid: pendingSync.guid,
              title: pendingSync.content_title,
              itemCount: itemsToLabel.length,
              ratingKeys,
            })
          } else {
            result.failed++
          }
        } catch (error) {
          this.log.error(
            `Error processing pending sync for ${pendingSync.guid}:`,
            error,
          )
          result.failed++
        }
      }

      // Clean up expired pending syncs
      const expiredCount = await this.db
        .knex('pending_label_syncs')
        .where('expires_at', '<=', new Date())
        .delete()

      if (expiredCount > 0) {
        this.log.info(`Cleaned up ${expiredCount} expired pending syncs`)
      }

      this.log.info('Completed processing pending label syncs', result)
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

    // Check configuration for labeling behavior
    const labelAllVersions = this.config.labelAllVersions ?? true // Default to true for multiple versions

    if (labelAllVersions) {
      this.log.debug(
        `Configuration set to label all ${plexItems.length} version(s) of content`,
        {
          items: plexItems.map((item) => ({
            ratingKey: item.ratingKey,
            title: item.title,
          })),
        },
      )
      return plexItems
    }
    this.log.debug(
      `Configuration set to label only first version, found ${plexItems.length} version(s)`,
      {
        selectedItem: {
          ratingKey: plexItems[0].ratingKey,
          title: plexItems[0].title,
        },
        skippedItems: plexItems.slice(1).map((item) => ({
          ratingKey: item.ratingKey,
          title: item.title,
        })),
      },
    )
    return [plexItems[0]]
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
