/**
 * Watchlist Cap Gate Module
 *
 * Determines which pending watchlist items should be skipped because
 * the owning user has reached their watchlist cap.
 *
 * Binary gate: total items (all statuses) >= cap → skip ALL pending items
 * for that user+contentType. Bypass-approval users are exempt.
 */

import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface WatchlistCapGateDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

export interface WatchlistCapGateResult {
  skipIds: Set<string>
  skippedCount: number
}

/**
 * Evaluates watchlist caps and returns the set of item IDs that should be
 * skipped during sync because their owner has hit their cap.
 *
 * @param deps - Database and logger
 * @param allWatchlistItems - Combined show + movie watchlist items
 * @returns Set of item IDs to skip and total skipped count
 */
export async function evaluateWatchlistCaps(
  deps: WatchlistCapGateDeps,
  allWatchlistItems: TokenWatchlistItem[],
): Promise<WatchlistCapGateResult> {
  const skipIds = new Set<string>()
  let skippedCount = 0

  const capsRows = await deps.db.getActiveWatchlistCaps()

  if (capsRows.length === 0) {
    return { skipIds, skippedCount }
  }

  const capsMap = new Map<string, number>()
  for (const row of capsRows) {
    capsMap.set(`${row.userId}:${row.contentType}`, row.watchlistCap)
  }

  // Count total items per user+type (all statuses)
  const totalCounts = new Map<string, number>()
  const pendingItems = new Map<string, TokenWatchlistItem[]>()

  for (const item of allWatchlistItems) {
    const mapKey = `${item.user_id}:${item.type}`
    if (!capsMap.has(mapKey)) continue

    totalCounts.set(mapKey, (totalCounts.get(mapKey) ?? 0) + 1)

    if (item.status === 'pending') {
      if (!pendingItems.has(mapKey)) pendingItems.set(mapKey, [])
      pendingItems.get(mapKey)?.push(item)
    }
  }

  // Build skip set — binary gate: total >= cap → skip ALL pending
  for (const [mapKey, cap] of capsMap) {
    const total = totalCounts.get(mapKey) ?? 0
    const pending = pendingItems.get(mapKey) ?? []

    if (pending.length === 0) continue

    if (total >= cap) {
      for (const item of pending) {
        skipIds.add(item.id)
      }
      skippedCount += pending.length
      const [userId, type] = mapKey.split(':')
      deps.logger.info(
        {
          userId: Number(userId),
          type,
          total,
          cap,
          pendingSkipped: pending.length,
        },
        'Watchlist cap reached — skipping all pending items',
      )
    }
  }

  return { skipIds, skippedCount }
}
