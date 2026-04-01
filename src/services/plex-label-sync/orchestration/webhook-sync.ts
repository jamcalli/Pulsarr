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

import {
  buildReconcilerDeps,
  reconcileLabelsForSingleItem,
} from '../label-operations/index.js'
import { computeDesiredTagLabels } from '../label-operations/label-validator.js'
import {
  createItemGuidResolver,
  trackLabelsForUsers,
} from '../tracking/content-tracker.js'

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
 * Gathers all users for the content and reconciles labels in a single pass.
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

    // Get all watchlist items matching this content
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

    // Split items by whether they have a Plex key
    const itemsWithKey = watchlistItems.filter((item) => item.key)
    const itemsWithoutKey = watchlistItems.filter((item) => !item.key)

    // Queue items without Plex keys for pending sync
    for (const item of itemsWithoutKey) {
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
    }

    if (itemsWithKey.length === 0) {
      return true
    }

    // Gather all users for this content
    const userIds = new Set(itemsWithKey.map((item) => item.user_id))
    const allUsers = await deps.db.getAllUsers()
    const relevantUsers = allUsers.filter((u) => userIds.has(u.id))

    const users = relevantUsers
      .map((u) => {
        const matchingItem = itemsWithKey.find((item) => item.user_id === u.id)
        if (!matchingItem) return null
        return {
          user_id: u.id,
          username: u.name || `user_${u.id}`,
          watchlist_id: Number(matchingItem.id),
        }
      })
      .filter(
        (u): u is { user_id: number; username: string; watchlist_id: number } =>
          u !== null,
      )

    // Compute desired labels for all users
    const desiredUserLabels = users.map(
      (u) => `${deps.labelPrefix}:${u.username}`,
    )

    const desiredTagLabels = computeDesiredTagLabels(
      webhookTags,
      contentType,
      deps.config.tagSync,
      deps.tagPrefix,
      deps.removedTagPrefix,
      deps.labelPrefix,
    )

    // Resolve to Plex items using first item's key
    // itemsWithKey is filtered to items where key is truthy
    const firstItem = itemsWithKey[0]
    const fullGuid = buildPlexGuid(
      contentType === 'show' ? 'show' : 'movie',
      firstItem.key as string,
    )
    const plexItems = await deps.plexServer.searchByGuid(fullGuid)

    if (plexItems.length === 0) {
      deps.logger.debug(
        { guids, contentType, fullGuid },
        'Content not found in Plex library',
      )
      for (const item of itemsWithKey) {
        await deps.queuePendingLabelSyncByWatchlistId(
          Number(item.id),
          item.title,
          webhookTags,
        )
      }
      return false
    }

    // Reconcile labels for each Plex item (handles multiple versions)
    let allSuccessful = true
    for (const plexItem of plexItems) {
      deps.logger.debug(
        {
          ratingKey: plexItem.ratingKey,
          title: firstItem.title,
          userCount: users.length,
          hasWebhookTags: desiredTagLabels.length > 0,
        },
        'Reconciling labels for Plex item',
      )

      const result = await reconcileLabelsForSingleItem(
        plexItem.ratingKey,
        desiredUserLabels,
        desiredTagLabels,
        firstItem.title,
        buildReconcilerDeps(deps),
      )

      if (!result.success) {
        allSuccessful = false
        continue
      }

      await trackLabelsForUsers({
        ratingKey: plexItem.ratingKey,
        users,
        getGuidsForUser: createItemGuidResolver(
          itemsWithKey,
          plexItem.ratingKey,
        ),
        tagLabels: desiredTagLabels,
        contentType: contentType === 'show' ? 'show' : 'movie',
        labelPrefix: deps.labelPrefix,
        db: deps.db,
        logger: deps.logger,
      })
    }

    if (allSuccessful) {
      deps.logger.info(
        { guids, contentType, itemCount: watchlistItems.length },
        'Webhook label sync completed successfully',
      )
    } else {
      deps.logger.info(
        {
          guids,
          contentType,
          itemCount: watchlistItems.length,
          note: 'Some Plex items failed to update',
        },
        'Webhook label sync completed with some failures',
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
 * Gathers all users who have this content and reconciles in one pass.
 */
export async function syncLabelForNewWatchlistItem(
  watchlistItemId: number,
  title: string,
  fetchTags: boolean,
  deps: WebhookSyncDeps,
): Promise<boolean> {
  let tags: string[] = []

  try {
    const watchlistItem = await deps.db.getWatchlistItemById(watchlistItemId)

    if (!watchlistItem) {
      deps.logger.warn(
        { watchlistItemId, title },
        'Watchlist item not found for immediate sync',
      )
      return false
    }

    if (fetchTags && deps.config.tagSync.enabled) {
      const guids = parseGuids(watchlistItem.guids)
      const tmdbId = extractTmdbId(guids) || undefined
      const tvdbId = extractTvdbId(guids) || undefined

      tags = await deps.fetchTagsForWatchlistItem({
        ...watchlistItem,
        id: watchlistItemId,
        guids,
        tmdbId,
        tvdbId,
      })
      deps.logger.debug(
        {
          watchlistItemId,
          title,
          tmdbId,
          tvdbId,
          tagsFound: tags.length,
          tags,
        },
        'Fetched tags for new watchlist item',
      )
    }

    // Attempt content-centric sync
    const success = await syncContentForWatchlistItem(
      { ...watchlistItem, id: watchlistItemId },
      tags,
      deps,
    )

    if (!success) {
      await deps.queuePendingLabelSyncByWatchlistId(
        watchlistItemId,
        title,
        tags,
      )
      deps.logger.debug(
        { watchlistItemId, title, tagsQueued: tags.length },
        'Queued watchlist item with fetched tags for later sync',
      )
    }

    return success
  } catch (error) {
    deps.logger.error(
      { error, watchlistItemId, title },
      'Error in immediate sync for new watchlist item',
    )
    await deps.queuePendingLabelSyncByWatchlistId(watchlistItemId, title, tags)
    return false
  }
}

/**
 * Content-centric sync for a single watchlist item. Gathers all users who have
 * the same content and reconciles labels for all of them in one pass.
 */
async function syncContentForWatchlistItem(
  watchlistItem: {
    id: string | number
    title: string
    key: string | null
    user_id: number
    type?: string
    guids?: string | string[]
  },
  webhookTags: string[],
  deps: WebhookSyncDeps,
): Promise<boolean> {
  if (!watchlistItem.key) {
    deps.logger.warn(
      { itemId: watchlistItem.id, title: watchlistItem.title },
      'Watchlist item missing Plex key',
    )
    return false
  }

  const contentType = watchlistItem.type || 'movie'

  // Find Plex items
  const fullGuid = buildPlexGuid(
    contentType === 'show' ? 'show' : 'movie',
    watchlistItem.key,
  )
  const plexItems = await deps.plexServer.searchByGuid(fullGuid)

  if (plexItems.length === 0) {
    deps.logger.debug(
      {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        fullGuid,
        contentType,
      },
      'Content not found in Plex library',
    )
    return false
  }

  // Gather ALL users who have this content (same plex key)
  const allItemsForContent = await deps.db.getWatchlistItemsByKeys([
    watchlistItem.key,
  ])

  const userIds = new Set(allItemsForContent.map((i) => i.user_id))
  const allUsers = await deps.db.getAllUsers()
  const relevantUsers = allUsers.filter((u) => userIds.has(u.id))

  const users = relevantUsers
    .map((u) => {
      const matchingItem = allItemsForContent.find((i) => i.user_id === u.id)
      if (!matchingItem) return null
      return {
        user_id: u.id,
        username: u.name || `user_${u.id}`,
        watchlist_id: Number(matchingItem.id),
      }
    })
    .filter(
      (u): u is { user_id: number; username: string; watchlist_id: number } =>
        u !== null,
    )

  // Compute desired labels
  const desiredUserLabels = users.map(
    (u) => `${deps.labelPrefix}:${u.username}`,
  )

  const desiredTagLabels = computeDesiredTagLabels(
    webhookTags,
    contentType,
    deps.config.tagSync,
    deps.tagPrefix,
    deps.removedTagPrefix,
    deps.labelPrefix,
  )

  // Reconcile labels for each Plex item
  let allSuccessful = true
  for (const plexItem of plexItems) {
    const result = await reconcileLabelsForSingleItem(
      plexItem.ratingKey,
      desiredUserLabels,
      desiredTagLabels,
      watchlistItem.title,
      buildReconcilerDeps(deps),
    )

    if (!result.success) {
      allSuccessful = false
      continue
    }

    await trackLabelsForUsers({
      ratingKey: plexItem.ratingKey,
      users,
      getGuidsForUser: createItemGuidResolver(
        allItemsForContent,
        plexItem.ratingKey,
      ),
      tagLabels: desiredTagLabels,
      contentType: contentType === 'show' ? 'show' : 'movie',
      labelPrefix: deps.labelPrefix,
      db: deps.db,
      logger: deps.logger,
    })
  }

  deps.logger.debug(
    {
      itemId: watchlistItem.id,
      title: watchlistItem.title,
      fullGuid,
      plexItemsFound: plexItems.length,
      userCount: users.length,
      allSuccessful,
    },
    'Content-centric label sync completed',
  )

  return allSuccessful
}
