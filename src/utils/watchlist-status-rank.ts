import type { WatchlistStatus } from '@root/types/watchlist-status.types.js'

export const STATUS_RANK: Readonly<Record<WatchlistStatus, number>> =
  Object.freeze({
    pending: 1,
    requested: 2,
    grabbed: 3,
    notified: 4,
  })

export function allowedStatusesUpTo(
  target: WatchlistStatus,
): WatchlistStatus[] {
  const t = STATUS_RANK[target] ?? 0
  return (Object.keys(STATUS_RANK) as WatchlistStatus[]).filter(
    (s) => (STATUS_RANK[s] ?? 0) <= t,
  )
}

export function isStatusUpgrade(
  from: WatchlistStatus,
  to: WatchlistStatus,
): boolean {
  return STATUS_RANK[to] > STATUS_RANK[from]
}
