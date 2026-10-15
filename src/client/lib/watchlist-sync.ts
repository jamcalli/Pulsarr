import type {
  ProgressEvent,
  WatchlistSyncMetadata,
  WatchlistSyncType,
} from '@root/types/progress.types'

export type WatchlistSyncCache = Partial<
  Record<WatchlistSyncType, ProgressEvent>
>

const SETTLED_STAGES: ReadonlyArray<WatchlistSyncMetadata['stage']> = [
  'complete',
  'failed',
]

/** True while the event belongs to a watchlist sync that has not reached its last stage. */
export function isSyncActive(event: ProgressEvent | undefined): boolean {
  const metadata = event?.metadata
  return (
    metadata !== undefined &&
    'stage' in metadata &&
    !SETTLED_STAGES.includes(metadata.stage)
  )
}

const OTHER_SYNC: Record<WatchlistSyncType, WatchlistSyncType> = {
  'self-watchlist': 'others-watchlist',
  'others-watchlist': 'self-watchlist',
}

/** Keeps a settled event only while the other sync still runs, so a finished row never outlives its run. */
export function nextWatchlistSyncCache(
  cache: WatchlistSyncCache,
  type: WatchlistSyncType,
  event: ProgressEvent,
): WatchlistSyncCache {
  if (!isSyncActive(event) && !isSyncActive(cache[OTHER_SYNC[type]])) return {}
  return { ...cache, [type]: event }
}
