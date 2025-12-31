/**
 * RSS Friends Processor
 *
 * Processes RSS items from friends' watchlists.
 * Groups items by author UUID, looks up user IDs, then routes.
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
import type { RssFriendsProcessorDeps } from '../types.js'
import { enrichRssItems } from './enricher.js'

/**
 * Process new items from friends RSS feed.
 * Groups items by author UUID, looks up user IDs, then routes.
 *
 * Flow:
 * 1. Group items by author UUID
 * 2. Check instance health (for later decision)
 * 3. For each author:
 *    a. Look up user ID via UUID
 *    b. Enrich items via Plex GUID lookup
 *    c. Process through unified processor (saves to DB)
 *    d. Route or queue based on health
 * 4. Run post-routing tasks
 *
 * @param items - New RSS items from friends feed
 * @param deps - Service dependencies
 */
export async function processRssFriendsItems(
  items: CachedRssItem[],
  deps: RssFriendsProcessorDeps,
): Promise<void> {
  // Group items by author UUID
  const itemsByAuthor = new Map<string, CachedRssItem[]>()
  const itemsWithoutAuthor: CachedRssItem[] = []

  for (const item of items) {
    if (item.author) {
      const authorItems = itemsByAuthor.get(item.author) ?? []
      authorItems.push(item)
      itemsByAuthor.set(item.author, authorItems)
    } else {
      itemsWithoutAuthor.push(item)
    }
  }

  if (itemsWithoutAuthor.length > 0) {
    deps.logger.warn(
      { count: itemsWithoutAuthor.length },
      'RSS items without author field - skipping (Plex may not support author yet)',
    )
  }

  // Check instance health before processing
  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    deferredRoutingQueue: deps.deferredRoutingQueue,
    logger: deps.logger,
  })

  // Process each author's items
  for (const [authorUuid, authorItems] of itemsByAuthor) {
    const userId = await deps.lookupUserByUuid(authorUuid)
    if (!userId) {
      deps.logger.debug(
        { authorUuid, itemCount: authorItems.length },
        'Skipping items for unknown author',
      )
      continue
    }

    // Get user info for unified processor (needed for both online and offline paths)
    const user = await deps.db.getUser(userId)
    if (!user) {
      deps.logger.warn({ userId, authorUuid }, 'User not found for author UUID')
      continue
    }

    // Enrich items
    const enrichedItems = await enrichRssItems(authorItems, userId, {
      logger: deps.logger,
      config: deps.config,
    })

    if (enrichedItems.length === 0) {
      continue
    }

    // Convert to TokenWatchlistItems for unified processor
    // IMPORTANT: Preserve guids, genres, thumb, and ratings from enrichment - these are required for routing
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
      ratings: item.ratings,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }))

    // ALWAYS process through DB first - ensures items are persisted regardless of instance health
    const { processedItems, linkedItems } = await processItemsForUser(
      {
        user: {
          userId,
          username: user.name,
          watchlistId: '',
        },
        items: tokenItems,
        isSelfWatchlist: false,
      },
      deps.itemProcessorDeps,
    )

    const allItems: Item[] = [...processedItems, ...linkedItems]
    if (allItems.length === 0) {
      continue
    }

    // If instances unavailable, queue for deferred routing (items already in DB)
    if (!health.available) {
      deps.logger.warn(
        {
          userId,
          itemCount: allItems.length,
          sonarrUnavailable: health.sonarrUnavailable,
          radarrUnavailable: health.radarrUnavailable,
        },
        'Some instances unavailable, queuing friend RSS items for deferred routing',
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
          userId,
          items: allItems,
        },
        'rss-friends',
      )
      continue
    }

    // Route items immediately
    await deps.routeEnrichedItemsForUser(userId, allItems)
  }

  // Post-routing tasks
  await deps.updateAutoApprovalUserAttribution()
  deps.scheduleDebouncedStatusSync()
}
