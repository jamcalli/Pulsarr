import type {
  ProgressEvent,
  WatchlistSyncMetadata,
  WatchlistSyncType,
} from '@root/types/progress.types'
import { isSyncActive, nextWatchlistSyncCache } from '@/lib/watchlist-sync'

function syncEvent(
  type: WatchlistSyncType,
  metadata: ProgressEvent['metadata'],
): ProgressEvent {
  return {
    operationId: `${type}-1`,
    type,
    phase: 'reading',
    progress: 35,
    message: 'Finding friends',
    metadata,
  }
}

const stage = (value: WatchlistSyncMetadata['stage']) => ({
  stage: value,
  count: null,
})

describe('isSyncActive', () => {
  it.each([
    'finding-friends',
    'reading',
    'processing',
    'rate-limited',
    'saving',
  ] as const)('is active at the %s stage', (value) => {
    expect(isSyncActive(syncEvent('others-watchlist', stage(value)))).toBe(true)
  })

  it.each([
    ['no event', undefined],
    ['a complete run', syncEvent('others-watchlist', stage('complete'))],
    ['a failed run', syncEvent('others-watchlist', stage('failed'))],
    ['no metadata', syncEvent('others-watchlist', undefined)],
    [
      'metadata without a stage',
      syncEvent('others-watchlist', { status: 'running' }),
    ],
  ])('is inactive with %s', (_, event) => {
    expect(isSyncActive(event)).toBe(false)
  })
})

describe('nextWatchlistSyncCache', () => {
  const selfReading = syncEvent('self-watchlist', stage('reading'))
  const friendsReading = syncEvent('others-watchlist', stage('reading'))
  const friendsDone = syncEvent('others-watchlist', stage('complete'))

  it('stores a running event', () => {
    expect(nextWatchlistSyncCache({}, 'self-watchlist', selfReading)).toEqual({
      'self-watchlist': selfReading,
    })
  })

  it('keeps a settled event while the other sync runs', () => {
    expect(
      nextWatchlistSyncCache(
        { 'self-watchlist': selfReading, 'others-watchlist': friendsReading },
        'others-watchlist',
        friendsDone,
      ),
    ).toEqual({
      'self-watchlist': selfReading,
      'others-watchlist': friendsDone,
    })
  })

  it('empties once the last running sync settles', () => {
    const selfDone = syncEvent('self-watchlist', stage('complete'))
    expect(
      nextWatchlistSyncCache(
        { 'self-watchlist': selfReading, 'others-watchlist': friendsDone },
        'self-watchlist',
        selfDone,
      ),
    ).toEqual({})
  })
})
