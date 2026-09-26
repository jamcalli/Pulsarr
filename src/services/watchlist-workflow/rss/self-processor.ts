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

export async function processRssSelfItems(
  items: CachedRssItem[],
  deps: WorkflowDeps,
): Promise<void> {
  const { signal } = deps.state
  const primaryUser = await deps.db.getPrimaryUser()
  if (!primaryUser) {
    deps.logger.warn('No primary user found, skipping self RSS processing')
    return
  }

  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    plexServerService: deps.fastify.plexServerService,
    skipIfExistsOnPlex: deps.config.skipIfExistsOnPlex,
    deferredRoutingQueue: deps.state.deferredRoutingQueue,
    logger: deps.logger,
  })

  const enrichedItems = await enrichRssItems(items, primaryUser.id, {
    logger: deps.logger,
    config: deps.config,
  })

  if (enrichedItems.length === 0) {
    return
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
        userId: primaryUser.id,
        username: primaryUser.name,
        watchlistId: '',
      },
      items: tokenItems,
      isSelfWatchlist: true,
    },
    deps.itemProcessorDeps,
  )
  if (signal.aborted) return

  const allItems: Item[] = [...processedItems, ...linkedItems]
  if (allItems.length === 0) {
    return
  }

  if (!health.available) {
    deps.logger.warn(
      {
        sonarrUnavailable: health.sonarrUnavailable,
        radarrUnavailable: health.radarrUnavailable,
        plexServerUnreachable: health.plexServerUnreachable,
        itemCount: allItems.length,
      },
      'Some instances unavailable, queuing self RSS items for deferred routing',
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
        userId: primaryUser.id,
        items: allItems,
      },
      'rss-self',
    )
    return
  }

  await routeEnrichedItemsForUser(primaryUser.id, allItems, deps)
  if (signal.aborted) return
  await updateAutoApprovalUserAttribution(deps)
  deps.state.scheduleDebouncedStatusSync(deps)
}
