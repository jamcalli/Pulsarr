import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  DatabaseWatchlistItem,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import {
  createRadarrStatusConfig,
  processStatusUpdates,
} from '@services/watchlist-status/status-sync/status-processor.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const ADDED = '2026-01-01T00:00:00Z'

function watchlistItem(status: WatchlistStatus): DatabaseWatchlistItem {
  return {
    id: 1,
    user_id: 7,
    title: 'Movie',
    key: 'movie-key',
    type: 'movie',
    added: ADDED,
    guids: ['tmdb:100'],
    status,
    movie_status: 'unavailable',
    radarr_instance_id: 1,
  }
}

function radarrItem(overrides: Partial<RadarrItem> = {}): RadarrItem {
  return {
    title: 'Movie',
    type: 'movie',
    guids: ['tmdb:100'],
    added: ADDED,
    movie_status: 'unavailable',
    radarr_instance_id: 1,
    ...overrides,
  }
}

function run(item: DatabaseWatchlistItem, arr: RadarrItem) {
  const logger = createMockLogger()
  return processStatusUpdates(
    { logger },
    createRadarrStatusConfig(logger),
    [arr],
    [item],
  )
}

describe('processStatusUpdates', () => {
  it('proposes an upgrade', () => {
    expect(
      run(watchlistItem('requested'), radarrItem({ status: 'grabbed' })),
    ).toEqual([{ userId: 7, key: 'movie-key', status: 'grabbed' }])
  })

  it('proposes nothing when the status is unchanged', () => {
    expect(
      run(watchlistItem('grabbed'), radarrItem({ status: 'grabbed' })),
    ).toEqual([])
  })

  it.each<[WatchlistStatus, WatchlistStatus]>([
    ['grabbed', 'requested'],
    ['notified', 'grabbed'],
    ['notified', 'requested'],
  ])('does not propose a downgrade from %s to %s', (current, arrStatus) => {
    expect(
      run(watchlistItem(current), radarrItem({ status: arrStatus })),
    ).toEqual([])
  })

  it('still proposes an added-date change alongside a rejected downgrade', () => {
    expect(
      run(
        watchlistItem('notified'),
        radarrItem({ status: 'grabbed', added: '2026-02-01T00:00:00Z' }),
      ),
    ).toEqual([{ userId: 7, key: 'movie-key', added: '2026-02-01T00:00:00Z' }])
  })

  it('leaves items without a matching arr item untouched', () => {
    expect(
      run(
        watchlistItem('requested'),
        radarrItem({ guids: ['tmdb:999'], status: 'grabbed' }),
      ),
    ).toEqual([])
  })
})
