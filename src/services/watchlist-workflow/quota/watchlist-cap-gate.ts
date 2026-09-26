// Binary gate: once a user's total items for a content type exceed the cap, every pending one is skipped

import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface WatchlistCapGateDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

export interface CappedEntry {
  userId: number
  contentType: 'movie' | 'show'
  currentCount: number
  cap: number
}

export interface WatchlistCapGateResult {
  skipIds: Set<string>
  skippedCount: number
  cappedEntries: CappedEntry[]
}

export async function evaluateWatchlistCaps(
  deps: WatchlistCapGateDeps,
  allWatchlistItems: TokenWatchlistItem[],
): Promise<WatchlistCapGateResult> {
  const skipIds = new Set<string>()
  let skippedCount = 0
  const cappedEntries: CappedEntry[] = []

  const capsRows = await deps.db.getActiveWatchlistCaps()

  if (capsRows.length === 0) {
    return { skipIds, skippedCount, cappedEntries }
  }

  const capsMap = new Map<string, number>()
  for (const row of capsRows) {
    capsMap.set(`${row.userId}:${row.contentType}`, row.watchlistCap)
  }

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

  for (const [mapKey, cap] of capsMap) {
    const total = totalCounts.get(mapKey) ?? 0
    const pending = pendingItems.get(mapKey) ?? []

    if (pending.length === 0) continue

    if (total > cap) {
      for (const item of pending) {
        skipIds.add(item.id)
      }
      skippedCount += pending.length
      const [userId, type] = mapKey.split(':')
      const numericUserId = Number(userId)
      deps.logger.info(
        {
          userId: numericUserId,
          type,
          total,
          cap,
          pendingSkipped: pending.length,
        },
        'Watchlist cap reached, skipping all pending items',
      )
      cappedEntries.push({
        userId: numericUserId,
        contentType: type as 'movie' | 'show',
        currentCount: total,
        cap,
      })
    }
  }

  return { skipIds, skippedCount, cappedEntries }
}
