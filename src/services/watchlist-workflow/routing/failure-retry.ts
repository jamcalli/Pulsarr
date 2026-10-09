import pLimit from 'p-limit'
import type { ContentRoutingDeps } from '../types.js'
import { routeEnrichedItemsForUser } from './item-router.js'

/** Low, because every retry can hit Radarr/Sonarr and the content router's enrichment APIs. */
export const RETRY_CONCURRENCY = 3

export interface RetryRoutingResult {
  attempted: number
  resolved: number
  stillFailing: number
  skipped: number
}

type RetryOutcome = 'resolved' | 'stillFailing' | 'skipped'

async function retryOne(
  watchlistItemId: number,
  deps: ContentRoutingDeps,
): Promise<RetryOutcome> {
  if (deps.state.signal.aborted) return 'skipped'

  const item = await deps.db.getWatchlistItemById(watchlistItemId)
  if (!item) return 'skipped'

  const user = await deps.db.getUser(item.user_id)
  if (!user?.can_sync) return 'skipped'

  // the normal path, so exclusions, approval rules and quotas all apply
  await routeEnrichedItemsForUser(item.user_id, [item], deps)

  return (await deps.db.hasRoutingFailures(watchlistItemId))
    ? 'stillFailing'
    : 'resolved'
}

/**
 * Routes each failed watchlist item again through the normal routing path,
 * at most `concurrency` at a time. An item whose user no longer exists or
 * has sync disabled is skipped and keeps its failure.
 */
export async function retryRoutingFailures(
  watchlistItemIds: number[],
  deps: ContentRoutingDeps,
  concurrency = RETRY_CONCURRENCY,
): Promise<RetryRoutingResult> {
  const limit = pLimit(concurrency)
  const result: RetryRoutingResult = {
    attempted: 0,
    resolved: 0,
    stillFailing: 0,
    skipped: 0,
  }

  const outcomes = await Promise.all(
    [...new Set(watchlistItemIds)].map((id) =>
      limit(async (): Promise<RetryOutcome> => {
        try {
          return await retryOne(id, deps)
        } catch (error) {
          deps.logger.error(
            { error, watchlistItemId: id },
            'Error retrying routing for watchlist item',
          )
          return 'stillFailing'
        }
      }),
    ),
  )

  for (const outcome of outcomes) {
    result[outcome]++
    if (outcome !== 'skipped') result.attempted++
  }

  deps.logger.info(result, 'Retried routing for failed watchlist items')
  return result
}
