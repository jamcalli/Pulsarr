import type {
  ProgressEvent,
  ProgressService,
  WatchlistSyncMetadata,
  WatchlistSyncType,
} from '@root/types/progress.types.js'

export interface WatchlistSyncProgress {
  findingFriends(): void
  /** Omit pages before the first page arrives, while the total is unknown. */
  readingPages(pages?: { done: number; total: number }): void
  /** inFlight maps each friend being read to their current page, in start order. */
  readingFriends(
    done: number,
    total: number,
    inFlight: ReadonlyMap<string, number>,
  ): void
  processingItems(done: number, total: number): void
  rateLimited(waitMs: number): void
  saving(itemCount: number): void
  complete(): void
  failed(): void
  /** The latest event built, emitted or not, starting with the run's first stage at 0 percent. */
  lastEvent(): ProgressEvent
}

const fraction = (done: number, total: number): number =>
  total > 0 ? Math.min(done / total, 1) : 1

const describeInFlight = (inFlight: ReadonlyMap<string, number>): string =>
  Array.from(inFlight, ([username, page]) => `${username} page ${page}`).join(
    ', ',
  )

const READING_END = 50
const PROCESSING_END = 95

const FIRST_STAGE: Record<
  WatchlistSyncType,
  { stage: WatchlistSyncMetadata['stage']; message: string }
> = {
  'self-watchlist': { stage: 'reading', message: 'Reading your watchlist' },
  'others-watchlist': { stage: 'finding-friends', message: 'Finding friends' },
}

/** Emits only while a client is connected, and the reported percent never decreases. */
export function createWatchlistSyncProgress(
  progress: ProgressService,
  type: WatchlistSyncType,
): WatchlistSyncProgress {
  const operationId = `${type}-${Date.now()}`
  let percent = 0
  let count: WatchlistSyncMetadata['count'] = null

  const build = (
    stage: WatchlistSyncMetadata['stage'],
    message: string,
  ): ProgressEvent => ({
    operationId,
    type,
    phase: stage,
    progress: percent,
    message,
    metadata: { stage, count },
  })

  let last = build(FIRST_STAGE[type].stage, FIRST_STAGE[type].message)

  const emit = (
    stage: WatchlistSyncMetadata['stage'],
    nextPercent: number,
    message: string,
    nextCount: WatchlistSyncMetadata['count'],
  ): void => {
    percent = Math.max(percent, Math.floor(nextPercent))
    count = nextCount
    last = build(stage, message)
    if (progress.hasActiveConnections()) progress.emit(last)
  }

  return {
    findingFriends: () =>
      emit('finding-friends', 0, FIRST_STAGE['others-watchlist'].message, null),
    readingPages: (pages) =>
      emit(
        'reading',
        pages ? READING_END * fraction(pages.done, pages.total) : 0,
        FIRST_STAGE['self-watchlist'].message,
        pages ? { ...pages, unit: 'pages' } : null,
      ),
    readingFriends: (done, total, inFlight) =>
      emit(
        'reading',
        READING_END * fraction(done, total),
        inFlight.size > 0
          ? describeInFlight(inFlight)
          : "Reading friends' watchlists",
        { done, total, unit: 'friends' },
      ),
    processingItems: (done, total) =>
      emit(
        'processing',
        READING_END + (PROCESSING_END - READING_END) * fraction(done, total),
        'Processing items',
        { done, total, unit: 'items' },
      ),
    rateLimited: (waitMs) =>
      emit(
        'rate-limited',
        percent,
        `Paused by a Plex rate limit, resuming in ${Math.ceil(waitMs / 1000)}s`,
        count,
      ),
    saving: (itemCount) =>
      emit(
        'saving',
        PROCESSING_END,
        `Saving ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
        null,
      ),
    complete: () => emit('complete', 100, 'Done', null),
    failed: () => emit('failed', percent, 'Sync failed', null),
    lastEvent: () => last,
  }
}
