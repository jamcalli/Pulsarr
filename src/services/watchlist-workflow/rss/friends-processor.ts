import type {
  CachedRssItem,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { processItemsForUser } from '@services/plex-watchlist/index.js'
import { updateAutoApprovalUserAttribution } from '../attribution/approval-attributor.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '../routing/health-checker.js'
import { routeEnrichedItemsForUser } from '../routing/item-router.js'
import type { WorkflowDeps } from '../types.js'
import { enrichRssItems } from './enricher.js'

export async function processRssFriendsItems(
  items: CachedRssItem[],
  deps: WorkflowDeps,
): Promise<void> {
  const { signal } = deps.state
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

  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    plexServerService: deps.fastify.plexServerService,
    skipIfExistsOnPlex: deps.config.skipIfExistsOnPlex,
    deferredRoutingQueue: deps.state.deferredRoutingQueue,
    logger: deps.logger,
  })

  for (const [authorUuid, authorItems] of itemsByAuthor) {
    if (signal.aborted) return
    const userId = await deps.state.lookupUserByUuid(authorUuid, deps)
    if (!userId) {
      deps.logger.debug(
        { authorUuid, itemCount: authorItems.length },
        'Skipping items for unknown author',
      )
      continue
    }

    const user = await deps.db.getUser(userId)
    if (!user) {
      deps.logger.warn({ userId, authorUuid }, 'User not found for author UUID')
      continue
    }

    const enrichedItems = await enrichRssItems(authorItems, userId, {
      logger: deps.logger,
      config: deps.config,
    })

    if (enrichedItems.length === 0) {
      continue
    }

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

    // Items are persisted before the routing decision so an unhealthy instance cannot lose them
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
    if (signal.aborted) return

    const allItems: Item[] = [...processedItems, ...linkedItems]
    if (allItems.length === 0) {
      continue
    }

    if (!health.available) {
      deps.logger.warn(
        {
          userId,
          itemCount: allItems.length,
          sonarrUnavailable: health.sonarrUnavailable,
          radarrUnavailable: health.radarrUnavailable,
          plexServerUnreachable: health.plexServerUnreachable,
        },
        'Some instances unavailable, queuing friend RSS items for deferred routing',
      )

      queueForDeferredRouting(
        {
          sonarrManager: deps.sonarrManager,
          radarrManager: deps.radarrManager,
          deferredRoutingQueue: deps.state.deferredRoutingQueue,
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

    await routeEnrichedItemsForUser(userId, allItems, deps)
  }

  if (signal.aborted) return
  await updateAutoApprovalUserAttribution(deps)
  deps.state.scheduleDebouncedStatusSync(deps)
}
