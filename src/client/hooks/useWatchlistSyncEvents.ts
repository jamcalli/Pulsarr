import { useProgressStore } from '@/stores/progressStore'

/** The latest event of each running watchlist sync, plus a settled one while the other sync still runs. */
export function useWatchlistSyncEvents() {
  return useProgressStore((state) => state.watchlistSyncCache)
}
