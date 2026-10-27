import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type {
  DatabaseWatchlistItem,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import {
  createRadarrStatusConfig,
  createSonarrStatusConfig,
  processStatusUpdates,
} from '@services/watchlist-status/status-sync/status-processor.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const ADDED = '2026-01-01T00:00:00Z'

function watchlistItem(
  status: WatchlistStatus,
  overrides: Partial<DatabaseWatchlistItem> = {},
): DatabaseWatchlistItem {
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
    ...overrides,
  }
}

function radarrItem(overrides: Partial<RadarrItem> = {}): RadarrItem {
  return {
    title: 'Movie',
    type: 'movie',
    guids: ['tmdb:100', 'radarr:55'],
    added: ADDED,
    movie_status: 'unavailable',
    radarr_instance_id: 1,
    ...overrides,
  }
}

function showItem(status: WatchlistStatus): DatabaseWatchlistItem {
  return {
    id: 2,
    user_id: 7,
    title: 'Show',
    key: 'show-key',
    type: 'show',
    added: ADDED,
    guids: ['tvdb:200'],
    status,
    series_status: 'continuing',
  }
}

function sonarrItem(overrides: Partial<SonarrItem> = {}): SonarrItem {
  return {
    title: 'Show',
    type: 'show',
    guids: ['tvdb:200', 'sonarr:42'],
    added: ADDED,
    status: 'grabbed',
    series_status: 'continuing',
    sonarr_instance_id: 3,
    ...overrides,
  }
}

function matchesFor<T>(item: DatabaseWatchlistItem, arr: T[]) {
  return new Map(item.id === undefined ? [] : [[item.id, arr]])
}

function run(item: DatabaseWatchlistItem, ...arr: RadarrItem[]) {
  const logger = createMockLogger()
  return processStatusUpdates(
    { logger },
    createRadarrStatusConfig(logger),
    matchesFor(item, arr),
    [item],
  )
}

function runShow(item: DatabaseWatchlistItem, ...arr: SonarrItem[]) {
  return processStatusUpdates(
    { logger: createMockLogger() },
    createSonarrStatusConfig(),
    matchesFor(item, arr),
    [item],
  )
}

describe('processStatusUpdates', () => {
  it('proposes an upgrade', () => {
    expect(
      run(watchlistItem('requested'), radarrItem({ status: 'grabbed' })),
    ).toEqual([{ userId: 7, key: 'movie-key', status: 'grabbed' }])
  })

  it('proposes nothing when the movie arr data matches the row', () => {
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
    expect(run(watchlistItem('requested'))).toEqual([])
  })

  it('proposes one movie update when only movie_status changes', () => {
    expect(
      run(
        watchlistItem('grabbed'),
        radarrItem({ status: 'grabbed', movie_status: 'available' }),
      ),
    ).toEqual([{ userId: 7, key: 'movie-key', movie_status: 'available' }])
  })

  it('proposes nothing when the arr item has no added date', () => {
    expect(
      run(
        watchlistItem('grabbed', { added: null }),
        radarrItem({ status: 'grabbed', added: undefined }),
      ),
    ).toEqual([])
  })

  it('proposes nothing when the show arr data matches the row', () => {
    expect(runShow(showItem('grabbed'), sonarrItem())).toEqual([])
  })

  it('proposes one show update when the status upgrades', () => {
    expect(runShow(showItem('requested'), sonarrItem())).toEqual([
      { userId: 7, key: 'show-key', status: 'grabbed' },
    ])
  })

  it('proposes one show update when the added date changes', () => {
    expect(
      runShow(
        showItem('grabbed'),
        sonarrItem({ added: '2026-03-01T00:00:00Z' }),
      ),
    ).toEqual([{ userId: 7, key: 'show-key', added: '2026-03-01T00:00:00Z' }])
  })
})

describe('processStatusUpdates across instances', () => {
  const secondInstance = { radarr_instance_id: 2, guids: ['tmdb:100'] }

  it('upgrades the status when only one instance has grabbed', () => {
    expect(
      run(
        watchlistItem('requested'),
        radarrItem({ status: 'requested' }),
        radarrItem({ ...secondInstance, status: 'grabbed' }),
      ),
    ).toEqual([{ userId: 7, key: 'movie-key', status: 'grabbed' }])
  })

  it('marks the movie available when only one instance has it', () => {
    expect(
      run(
        watchlistItem('grabbed'),
        radarrItem({ status: 'grabbed', movie_status: 'unavailable' }),
        radarrItem({
          ...secondInstance,
          status: 'grabbed',
          movie_status: 'available',
        }),
      ),
    ).toEqual([{ userId: 7, key: 'movie-key', movie_status: 'available' }])
  })

  it('takes the earliest added date', () => {
    expect(
      run(
        watchlistItem('grabbed'),
        radarrItem({ status: 'grabbed', added: '2026-03-01T00:00:00Z' }),
        radarrItem({
          ...secondInstance,
          status: 'grabbed',
          added: '2025-12-01T00:00:00Z',
        }),
      ),
    ).toEqual([{ userId: 7, key: 'movie-key', added: '2025-12-01T00:00:00Z' }])
  })

  it('takes the series status from the first match', () => {
    expect(
      runShow(
        showItem('grabbed'),
        sonarrItem({ series_status: 'ended' }),
        sonarrItem({ sonarr_instance_id: 4, series_status: 'continuing' }),
      ),
    ).toEqual([{ userId: 7, key: 'show-key', series_status: 'ended' }])
  })

  it('drops a match that fails validation and lets the other drive the row', () => {
    const logger = createMockLogger()
    const config = {
      ...createRadarrStatusConfig(logger),
      validateContentStatus: (content: RadarrItem) =>
        content.radarr_instance_id !== 1,
    }
    const item = watchlistItem('requested')
    expect(
      processStatusUpdates(
        { logger },
        config,
        matchesFor(item, [
          radarrItem({ status: 'grabbed', movie_status: 'available' }),
          radarrItem({
            ...secondInstance,
            status: 'requested',
            added: '2026-02-01T00:00:00Z',
          }),
        ]),
        [item],
      ),
    ).toEqual([{ userId: 7, key: 'movie-key', added: '2026-02-01T00:00:00Z' }])
  })

  it('proposes nothing when every match fails validation', () => {
    const logger = createMockLogger()
    const config = {
      ...createRadarrStatusConfig(logger),
      validateContentStatus: () => false,
    }
    const item = watchlistItem('requested')
    expect(
      processStatusUpdates(
        { logger },
        config,
        matchesFor(item, [radarrItem({ status: 'grabbed' })]),
        [item],
      ),
    ).toEqual([])
  })
})
