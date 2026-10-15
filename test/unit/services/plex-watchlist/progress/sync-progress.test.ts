import type { ProgressEvent } from '@root/types/progress.types.js'
import { createWatchlistSyncProgress } from '@services/plex-watchlist/progress/sync-progress.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('plex-watchlist/progress/sync-progress', () => {
  let connected: boolean
  const progressService = {
    emit: vi.fn<(event: ProgressEvent) => void>(),
    hasActiveConnections: vi.fn(() => connected),
  }

  const lastEvent = () => progressService.emit.mock.lastCall?.[0]

  beforeEach(() => {
    connected = true
    progressService.emit.mockClear()
  })

  it('maps each stage to its percent band, message and count', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'self-watchlist',
    )

    progress.readingPages()
    expect(lastEvent()).toMatchObject({
      type: 'self-watchlist',
      phase: 'reading',
      progress: 0,
      message: 'Reading your watchlist',
      metadata: { stage: 'reading', count: null },
    })

    progress.readingPages({ done: 1, total: 4 })
    expect(lastEvent()).toMatchObject({
      progress: 12,
      metadata: { count: { done: 1, total: 4, unit: 'pages' } },
    })

    progress.processingItems(1, 3)
    expect(lastEvent()).toMatchObject({
      phase: 'processing',
      progress: 65,
      message: 'Processing items',
      metadata: {
        stage: 'processing',
        count: { done: 1, total: 3, unit: 'items' },
      },
    })

    progress.saving(2)
    expect(lastEvent()).toMatchObject({
      phase: 'saving',
      progress: 95,
      message: 'Saving 2 items',
      metadata: { stage: 'saving', count: null },
    })

    progress.complete()
    expect(lastEvent()).toMatchObject({
      phase: 'complete',
      progress: 100,
      message: 'Done',
      metadata: { stage: 'complete', count: null },
    })
  })

  it('uses one operation id for every event', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'others-watchlist',
    )

    progress.findingFriends()
    progress.complete()

    const ids = progressService.emit.mock.calls.map(
      ([event]) => event.operationId,
    )
    expect(new Set(ids).size).toBe(1)
    expect(progressService.emit.mock.calls[0][0]).toMatchObject({
      phase: 'finding-friends',
      progress: 0,
      message: 'Finding friends',
      metadata: { stage: 'finding-friends', count: null },
    })
  })

  it('uses the singular for one saved item', () => {
    createWatchlistSyncProgress(progressService, 'self-watchlist').saving(1)

    expect(lastEvent()?.message).toBe('Saving 1 item')
  })

  it('never lets the percent go backwards', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'self-watchlist',
    )

    progress.processingItems(2, 2)
    progress.readingPages({ done: 1, total: 2 })

    expect(lastEvent()?.progress).toBe(95)
  })

  it('names every friend in flight in start order', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'others-watchlist',
    )
    const inFlight = new Map([
      ['Alice', 3],
      ['Bob', 1],
    ])

    progress.readingFriends(1, 4, inFlight)

    expect(lastEvent()).toMatchObject({
      phase: 'reading',
      progress: 12,
      message: 'Alice page 3, Bob page 1',
      metadata: { count: { done: 1, total: 4, unit: 'friends' } },
    })

    progress.readingFriends(1, 4, new Map())
    expect(lastEvent()?.message).toBe("Reading friends' watchlists")
  })

  it('keeps the percent and count while rate limited', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'self-watchlist',
    )

    progress.processingItems(1, 2)
    progress.rateLimited(4200)

    expect(lastEvent()).toMatchObject({
      phase: 'rate-limited',
      progress: 72,
      message: 'Paused by a Plex rate limit, resuming in 5s',
      metadata: {
        stage: 'rate-limited',
        count: { done: 1, total: 2, unit: 'items' },
      },
    })
  })

  it('emits nothing without an active connection and resumes once one connects', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'self-watchlist',
    )

    connected = false
    progress.processingItems(1, 2)
    expect(progressService.emit).not.toHaveBeenCalled()

    connected = true
    progress.rateLimited(1000)
    expect(lastEvent()).toMatchObject({
      progress: 72,
      metadata: { count: { done: 1, total: 2, unit: 'items' } },
    })
  })

  it('treats a zero total as a finished stage', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'others-watchlist',
    )

    progress.readingFriends(0, 0, new Map())
    expect(lastEvent()?.progress).toBe(50)

    progress.processingItems(0, 0)
    expect(lastEvent()?.progress).toBe(95)
  })

  it('reports a failure at the percent it reached', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'self-watchlist',
    )

    progress.processingItems(1, 2)
    progress.failed()

    expect(lastEvent()).toMatchObject({
      phase: 'failed',
      progress: 72,
      message: 'Sync failed',
      metadata: { stage: 'failed', count: null },
    })
  })

  it('starts with the first stage of each sync type at 0 percent', () => {
    expect(
      createWatchlistSyncProgress(
        progressService,
        'self-watchlist',
      ).lastEvent(),
    ).toMatchObject({
      type: 'self-watchlist',
      phase: 'reading',
      progress: 0,
      message: 'Reading your watchlist',
      metadata: { stage: 'reading', count: null },
    })
    expect(
      createWatchlistSyncProgress(
        progressService,
        'others-watchlist',
      ).lastEvent(),
    ).toMatchObject({
      type: 'others-watchlist',
      phase: 'finding-friends',
      progress: 0,
      message: 'Finding friends',
    })
    expect(progressService.emit).not.toHaveBeenCalled()
  })

  it('keeps the latest event while no client is connected', () => {
    const progress = createWatchlistSyncProgress(
      progressService,
      'others-watchlist',
    )

    connected = false
    progress.readingFriends(1, 2, new Map([['Alice', 2]]))

    expect(progressService.emit).not.toHaveBeenCalled()
    expect(progress.lastEvent()).toMatchObject({
      phase: 'reading',
      progress: 25,
      message: 'Alice page 2',
      metadata: { count: { done: 1, total: 2, unit: 'friends' } },
    })
  })
})
