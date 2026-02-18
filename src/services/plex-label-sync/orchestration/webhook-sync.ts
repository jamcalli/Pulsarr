/**
 * Webhook Synchronization Orchestration
 *
 * Handles real-time label synchronization triggered by webhook events from Sonarr/Radarr.
 * Processes webhook payloads and applies labels to Plex content as items are downloaded.
 */

import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import {
  buildPlexGuid,
  extractTmdbId,
  extractTvdbId,
  parseGuids,
} from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

import { applyLabelsToSingleItem as applyLabelsUtil } from '../label-operations/index.js'

/**
 * Dependencies required for webhook synchronization operations
 */
export interface WebhookSyncDeps {
  plexServer: PlexServerService
  db: DatabaseService
  logger: FastifyBaseLogger
  config: PlexLabelSyncConfig
  radarrManager: RadarrManagerService
  sonarrManager: SonarrManagerService
  fastify: FastifyInstance
  labelPrefix: string
  removedLabelPrefix: string
  removedLabelMode: 'remove' | 'keep' | 'special-label'
  tagPrefix: string
  removedTagPrefix: string
  queuePendingLabelSyncByWatchlistId: (
    watchlistItemId: number,
    title: string,
    webhookTags: string[],
  ) => Promise<void>
  extractContentGuidFromWebhook: (
    webhook: WebhookPayload,
  ) => { guids: string[]; contentType: 'movie' | 'show' } | null
  extractTagsFromWebhook: (webhook: WebhookPayload) => string[]
  fetchTagsForWatchlistItem: (watchlistItem: {
    id: string | number
    title: string
    key: string | null
    type?: string
    guids?: string[]
    tmdbId?: number
    tvdbId?: number
  }) => Promise<string[]>
}

/**
 * Synchronizes labels for content when a webhook is received.
 * This is the main entry point for real-time label updates.
 *
 * @param webhook - The webhook payload from Sonarr/Radarr
 * @param deps - Service dependencies
 * @returns Promise resolving to true if sync was successful, false otherwise
 */
export async function syncLabelsOnWebhook(
  webhook: WebhookPayload,
  deps: WebhookSyncDeps,
): Promise<boolean> {
  if (!deps.config.enabled) {
    deps.logger.debug(
      'Plex label sync is disabled, skipping webhook processing',
    )
    return false
  }

  try {
    deps.logger.debug(
      {
        eventType: 'eventType' in webhook ? webhook.eventType : 'Unknown',
        instanceName: webhook.instanceName,
      },
      'Processing webhook for label sync',
    )

    // Extract content GUID and type from webhook
    const contentData = deps.extractContentGuidFromWebhook(webhook)
    if (!contentData) {
      deps.logger.warn(
        {
          instanceName: webhook?.instanceName,
          eventType: 'eventType' in webhook ? webhook.eventType : undefined,
          content:
            'movie' in webhook
              ? { title: webhook.movie?.title, tmdbId: webhook.movie?.tmdbId }
              : 'series' in webhook
                ? {
                    title: webhook.series?.title,
                    tvdbId: webhook.series?.tvdbId,
                  }
                : undefined,
        },
        'Unable to extract content GUID from webhook',
      )
      return false
    }

    const { guids, contentType } = contentData

    // Extract tag data from webhook if tag sync is enabled
    const webhookTags = deps.extractTagsFromWebhook(webhook)

    deps.logger.debug(
      {
        guids,
        contentType,
        instanceName: webhook.instanceName,
        tags: webhookTags,
        tagSyncEnabled: deps.config.tagSync.enabled,
      },
      'Extracted content data from webhook',
    )

    // Get watchlist items that match this GUID (use first GUID for database lookup)
    const watchlistItems = await deps.db.getWatchlistItemsByGuid(guids[0])
    if (watchlistItems.length === 0) {
      deps.logger.debug(
        {
          guids,
          contentType,
          note: 'Content may be downloaded before appearing in watchlists - will retry when watchlist syncs',
        },
        'No users have this content in their watchlist yet',
      )
      return true
    }

    deps.logger.debug(
      {
        guids,
        contentType,
        itemCount: watchlistItems.length,
        items: watchlistItems.map((item) => ({
          id: item.id,
          title: item.title,
          plex_key: item.key,
          user_id: item.user_id,
        })),
      },
      'Found watchlist items for webhook content',
    )

    // Process each watchlist item directly using Plex keys
    let allSuccessful = true
    for (const item of watchlistItems) {
      if (!item.key) {
        deps.logger.warn(
          {
            itemId: item.id,
            title: item.title,
            webhookTags: webhookTags.length,
          },
          'Watchlist item missing Plex key, queuing for pending sync',
        )
        await deps.queuePendingLabelSyncByWatchlistId(
          Number(item.id),
          item.title,
          webhookTags,
        )
        continue
      }

      const success = await syncLabelForWatchlistItem(
        Number(item.id),
        item.title,
        webhookTags,
        deps,
      )
      if (!success) {
        allSuccessful = false
      }
    }

    if (allSuccessful) {
      deps.logger.info(
        {
          guids,
          contentType,
          itemCount: watchlistItems.length,
          labelsApplied: true,
        },
        'Webhook label sync completed successfully',
      )
    } else {
      deps.logger.info(
        {
          guids,
          contentType,
          itemCount: watchlistItems.length,
          labelsApplied: false,
          note: 'Content not yet available in Plex, queued for pending sync',
        },
        'Webhook label sync completed with some items queued for retry',
      )
    }

    return allSuccessful
  } catch (error) {
    deps.logger.error({ error }, 'Error processing webhook for label sync:')
    return false
  }
}

/**
 * Immediately syncs labels for a newly added watchlist item with tag fetching.
 * This method attempts to fetch tags from *arr instances and apply them immediately.
 *
 * @param watchlistItemId - The watchlist item ID
 * @param title - The content title
 * @param fetchTags - Whether to fetch tags from *arr instances
 * @param deps - Service dependencies
 * @returns Promise resolving to true if successful, false otherwise (queues for later if not found)
 */
export async function syncLabelForNewWatchlistItem(
  watchlistItemId: number,
  title: string,
  fetchTags: boolean,
  deps: WebhookSyncDeps,
): Promise<boolean> {
  try {
    // Get the watchlist item details including GUIDs for targeted lookup
    const watchlistItem = await deps.db
      .knex('watchlist_items')
      .where('id', watchlistItemId)
      .select('id', 'title', 'key', 'user_id', 'type', 'guids')
      .first()

    if (!watchlistItem) {
      deps.logger.warn(
        {
          watchlistItemId,
          title,
        },
        'Watchlist item not found for immediate sync',
      )
      return false
    }

    // Fetch tags if requested and tag sync is enabled
    let tags: string[] = []
    if (fetchTags && deps.config.tagSync.enabled) {
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

      tags = await deps.fetchTagsForWatchlistItem(enhancedWatchlistItem)
      deps.logger.debug(
        {
          watchlistItemId,
          title,
          tmdbId,
          tvdbId,
          tagsFound: tags.length,
          tags,
        },
        'Fetched tags for new watchlist item using targeted approach',
      )
    }

    // Attempt immediate sync with fetched tags
    const success = await syncLabelForWatchlistItem(
      watchlistItemId,
      title,
      tags,
      deps,
    )

    if (!success) {
      // If immediate sync failed, queue for later with the fetched tags
      await deps.queuePendingLabelSyncByWatchlistId(
        watchlistItemId,
        title,
        tags,
      )
      deps.logger.debug(
        {
          watchlistItemId,
          title,
          tagsQueued: tags.length,
        },
        'Queued watchlist item with fetched tags for later sync',
      )
    }

    return success
  } catch (error) {
    deps.logger.error(
      {
        error,
        watchlistItemId,
        title,
      },
      'Error in immediate sync for new watchlist item',
    )

    // Fallback to queuing without tags
    await deps.queuePendingLabelSyncByWatchlistId(watchlistItemId, title, [])
    return false
  }
}

/**
 * Syncs labels for a single watchlist item by resolving GUID to rating key.
 *
 * @param watchlistItemId - The watchlist item ID
 * @param title - The content title
 * @param webhookTags - Optional tags from webhook for immediate tag sync
 * @param deps - Service dependencies
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function syncLabelForWatchlistItem(
  watchlistItemId: number,
  title: string,
  webhookTags: string[] | undefined,
  deps: WebhookSyncDeps,
): Promise<boolean> {
  try {
    // Get the full watchlist item details
    const watchlistItem = await deps.db
      .knex('watchlist_items')
      .where('id', watchlistItemId)
      .select('id', 'title', 'key', 'user_id', 'type')
      .first()

    if (!watchlistItem) {
      deps.logger.warn(
        {
          watchlistItemId,
          title,
        },
        'Watchlist item not found',
      )
      return false
    }

    if (!watchlistItem.key) {
      deps.logger.warn(
        {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
        },
        'Watchlist item missing Plex key',
      )
      return false
    }

    // Get user information
    const user = await deps.db
      .knex('users')
      .where('id', watchlistItem.user_id)
      .select('id', 'name')
      .first()

    if (!user) {
      deps.logger.warn(
        {
          itemId: watchlistItem.id,
          userId: watchlistItem.user_id,
        },
        'User not found for watchlist item',
      )
      return false
    }

    const username = user.name || `user_${user.id}`

    // Resolve GUID part to Plex rating key
    const contentType = watchlistItem.type || 'movie'

    const fullGuid = buildPlexGuid(
      contentType === 'show' ? 'show' : 'movie',
      watchlistItem.key,
    )

    deps.logger.debug(
      {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        guidPart: watchlistItem.key,
        fullGuid,
        contentType,
      },
      'Resolving GUID to rating key for label sync',
    )

    // Search for the content in Plex using the full GUID
    const plexItems = await deps.plexServer.searchByGuid(fullGuid)

    if (plexItems.length === 0) {
      deps.logger.debug(
        {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
          guidPart: watchlistItem.key,
          fullGuid,
          contentType,
        },
        'Content not found in Plex library',
      )

      // Queue for pending sync since content might be added to Plex later
      await deps.queuePendingLabelSyncByWatchlistId(
        Number(watchlistItem.id),
        watchlistItem.title,
        webhookTags || [],
      )

      return false
    }

    // Apply labels to all found items (handles multiple versions)
    let allSuccessful = true
    for (const plexItem of plexItems) {
      deps.logger.debug(
        {
          itemId: watchlistItem.id,
          title: watchlistItem.title,
          ratingKey: plexItem.ratingKey,
          plexTitle: plexItem.title,
          hasWebhookTags: webhookTags && webhookTags.length > 0,
          webhookTagCount: webhookTags?.length || 0,
        },
        'Applying labels to Plex item',
      )

      // Apply combined user and webhook tag labels in a single API call
      const success = await applyLabelsUtil(
        plexItem.ratingKey,
        [
          {
            user_id: watchlistItem.user_id,
            username,
            watchlist_id: Number(watchlistItem.id),
          },
        ],
        {
          plexServer: deps.plexServer,
          db: deps.db,
          logger: deps.logger,
          config: deps.config,
          removedLabelMode: deps.removedLabelMode,
          removedLabelPrefix: deps.removedLabelPrefix,
          tagPrefix: deps.tagPrefix,
          removedTagPrefix: deps.removedTagPrefix,
        },
        webhookTags,
        watchlistItem.type || 'movie',
      )

      if (!success) {
        allSuccessful = false
      }
    }

    deps.logger.debug(
      {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        guidPart: watchlistItem.key,
        fullGuid,
        plexItemsFound: plexItems.length,
        ratingKeys: plexItems.map((item) => item.ratingKey),
        username,
        allSuccessful,
      },
      'GUID-resolved label sync completed',
    )

    return allSuccessful
  } catch (error) {
    deps.logger.error({ error }, 'Error syncing label for watchlist item:')
    return false
  }
}
