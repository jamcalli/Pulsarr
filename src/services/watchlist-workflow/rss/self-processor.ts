/**
 * RSS Self Processor
 *
 * Processes RSS items from the primary user's watchlist.
 * Enriches items, saves to DB, and routes to Sonarr/Radarr.
 */

import type {
  CachedRssItem,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { processItemsForUser } from '@services/plex-watchlist/index.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '../routing/index.js'
import type { RssProcessorDeps } from '../types.js'
import { enrichRssItems } from './enricher.js'

/**
 * Process new items from self (primary user) RSS feed.
 *
 * Flow:
 * 1. Get primary user
 * 2. Check instance health (for later decision)
 * 3. Enrich items via Plex GUID lookup
 * 4. Process through unified processor (saves to DB)
 * 5. If instances available, route immediately
 * 6. If instances unavailable, queue for deferred routing
 *
 * @param items - New RSS items to process
 * @param deps - Service dependencies
 */
export async function processRssSelfItems(
  items: CachedRssItem[],
  deps: RssProcessorDeps,
): Promise<void> {
  const primaryUser = await deps.db.getPrimaryUser()
  if (!primaryUser) {
    deps.logger.warn('No primary user found, skipping self RSS processing')
    return
  }

  // Check instance health before processing
  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    deferredRoutingQueue: deps.deferredRoutingQueue,
    logger: deps.logger,
  })

  // Enrich items first (needed for both online and offline paths)
  const enrichedItems = await enrichRssItems(items, primaryUser.id, {
    logger: deps.logger,
    config: deps.config,
  })

  if (enrichedItems.length === 0) {
    return
  }

  // Convert to TokenWatchlistItems for unified processor
  // IMPORTANT: Preserve guids, genres, and thumb from enrichment - these are required for routing
  const tokenItems: TokenWatchlistItem[] = enrichedItems.map((item) => ({
    id: item.key,
    title: item.title,
    type: item.type.toLowerCase(),
    user_id: item.user_id,
    status: 'pending' as const,
    key: item.key,
    thumb: item.thumb,
    guids: item.guids,
    genres: item.genres,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }))

  // ALWAYS process through DB first - ensures items are persisted regardless of instance health
  const { processedItems, linkedItems } = await processItemsForUser(
    {
      user: {
        userId: primaryUser.id,
        username: primaryUser.name,
        watchlistId: '',
      },
      items: tokenItems,
      isSelfWatchlist: true,
    },
    deps.itemProcessorDeps,
  )

  const allItems: Item[] = [...processedItems, ...linkedItems]
  if (allItems.length === 0) {
    return
  }

  // If instances unavailable, queue for deferred routing (items already in DB)
  if (!health.available) {
    deps.logger.warn(
      {
        sonarrUnavailable: health.sonarrUnavailable,
        radarrUnavailable: health.radarrUnavailable,
        itemCount: allItems.length,
      },
      'Some instances unavailable, queuing self RSS items for deferred routing',
    )

    queueForDeferredRouting(
      {
        sonarrManager: deps.sonarrManager,
        radarrManager: deps.radarrManager,
        deferredRoutingQueue: deps.deferredRoutingQueue,
        logger: deps.logger,
      },
      {
        type: 'items',
        userId: primaryUser.id,
        items: allItems,
      },
      'rss-self',
    )
    return
  }

  // Route items immediately
  await deps.routeEnrichedItemsForUser(primaryUser.id, allItems)
  await deps.updateAutoApprovalUserAttribution()
  deps.scheduleDebouncedStatusSync()
}
