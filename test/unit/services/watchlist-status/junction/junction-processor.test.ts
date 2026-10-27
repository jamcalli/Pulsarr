import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type {
  DatabaseWatchlistItem,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  createSonarrJunctionConfig,
  processJunctionUpdates,
} from '@services/watchlist-status/junction/junction-processor.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

interface Entry {
  watchlist_id: number
  radarr_instance_id: number
  status: WatchlistStatus
  is_primary: boolean
  last_notified_at: string | null
}

function watchlistItem(status: WatchlistStatus): DatabaseWatchlistItem {
  return {
    id: 1,
    user_id: 7,
    title: 'Movie',
    key: 'movie-key',
    type: 'movie',
    guids: ['tmdb:100'],
    status,
  }
}

function radarrItem(status: WatchlistStatus, instanceId = 2): RadarrItem {
  return {
    title: 'Movie',
    type: 'movie',
    guids: ['tmdb:100'],
    status,
    radarr_instance_id: instanceId,
  }
}

function junction(status: WatchlistStatus): Entry {
  return {
    watchlist_id: 1,
    radarr_instance_id: 2,
    status,
    is_primary: true,
    last_notified_at: null,
  }
}

async function run(
  item: DatabaseWatchlistItem,
  arr: RadarrItem | RadarrItem[],
  existing: Entry[],
) {
  const config = {
    contentType: 'movie' as const,
    getItemInstanceId: (i: RadarrItem) => i.radarr_instance_id,
    getEntryInstanceId: (e: Entry) => e.radarr_instance_id,
    fetchJunctions: vi.fn(async () => existing),
    bulkAdd: vi.fn(async () => {}),
    bulkUpdate: vi.fn(async () => {}),
    bulkRemove: vi.fn(async () => {}),
  }
  const result = await processJunctionUpdates(
    { logger: createMockLogger() },
    config,
    [arr].flat(),
    [item],
  )
  return { ...config, result }
}

describe('processJunctionUpdates', () => {
  it('skips a downgrade on an existing junction', async () => {
    const config = await run(
      watchlistItem('grabbed'),
      radarrItem('requested'),
      [junction('grabbed')],
    )
    expect(config.bulkUpdate).not.toHaveBeenCalled()
    expect(config.result).toEqual({
      updated: 0,
      userIds: [],
      matches: new Map([[1, [radarrItem('requested')]]]),
    })
  })

  it('applies an upgrade on an existing junction', async () => {
    const config = await run(
      watchlistItem('requested'),
      radarrItem('grabbed'),
      [junction('requested')],
    )
    expect(config.bulkUpdate).toHaveBeenCalledWith([
      { watchlist_id: 1, instance_id: 2, status: 'grabbed' },
    ])
    expect(config.result).toEqual({
      updated: 1,
      userIds: [7],
      matches: new Map([[1, [radarrItem('grabbed')]]]),
    })
  })

  it('forces notified when the watchlist item is notified', async () => {
    const config = await run(watchlistItem('notified'), radarrItem('grabbed'), [
      junction('grabbed'),
    ])
    expect(config.bulkUpdate).toHaveBeenCalledWith([
      {
        watchlist_id: 1,
        instance_id: 2,
        status: 'notified',
        last_notified_at: undefined,
      },
    ])
  })

  it('creates a missing junction at the arr status', async () => {
    const config = await run(
      watchlistItem('requested'),
      radarrItem('grabbed'),
      [],
    )
    expect(config.bulkAdd).toHaveBeenCalledWith([
      { watchlist_id: 1, instance_id: 2, status: 'grabbed', is_primary: true },
    ])
  })

  it('returns the match from every instance the row is on, in instance order', async () => {
    const onSecond = radarrItem('requested')
    const onFifth = radarrItem('grabbed', 5)
    const config = await run(
      watchlistItem('requested'),
      [onSecond, onFifth],
      [junction('requested')],
    )
    expect(config.result.matches).toEqual(new Map([[1, [onSecond, onFifth]]]))
  })

  it('returns no matches for a row on no instance', async () => {
    const config = await run(
      watchlistItem('requested'),
      { ...radarrItem('grabbed'), guids: ['tmdb:999'] },
      [],
    )
    expect(config.result.matches).toEqual(new Map())
  })
})

describe('processJunctionUpdates with the Sonarr config', () => {
  const show: DatabaseWatchlistItem = {
    id: 1,
    user_id: 7,
    title: 'Show',
    key: 'show-key',
    type: 'show',
    guids: ['tvdb:200'],
    status: 'grabbed',
  }

  const series: SonarrItem = {
    title: 'Show',
    type: 'show',
    guids: ['tvdb:200', 'sonarr:42'],
    status: 'grabbed',
    sonarr_instance_id: 3,
  }

  function sonarrEntry(sonarrSeriesId: number | null) {
    return {
      watchlist_id: 1,
      sonarr_instance_id: 3,
      status: 'grabbed' as const,
      is_primary: true,
      last_notified_at: null,
      sonarr_series_id: sonarrSeriesId,
    }
  }

  async function runSonarr(existing: ReturnType<typeof sonarrEntry>[]) {
    const db = {
      getAllWatchlistSonarrInstanceJunctions: vi.fn(async () => existing),
      bulkAddWatchlistToSonarrInstances: vi.fn(async () => {}),
      bulkUpdateWatchlistSonarrInstanceStatuses: vi.fn(async () => {}),
      bulkRemoveWatchlistFromSonarrInstances: vi.fn(async () => {}),
    }
    const result = await processJunctionUpdates(
      { logger: createMockLogger() },
      createSonarrJunctionConfig(db as unknown as DatabaseService),
      [series],
      [show],
    )
    return { db, result }
  }

  it.each([null, 41])(
    'replaces a %s series id with the guid id',
    async (current) => {
      const { db, result } = await runSonarr([sonarrEntry(current)])
      expect(db.bulkUpdateWatchlistSonarrInstanceStatuses).toHaveBeenCalledWith(
        [
          {
            watchlist_id: 1,
            sonarr_instance_id: 3,
            sonarr_series_id: 42,
          },
        ],
      )
      expect(result).toEqual({
        updated: 1,
        userIds: [7],
        matches: new Map([[1, [series]]]),
      })
    },
  )

  it('writes nothing once the series id is backfilled', async () => {
    const { db, result } = await runSonarr([sonarrEntry(42)])
    expect(db.bulkUpdateWatchlistSonarrInstanceStatuses).not.toHaveBeenCalled()
    expect(result).toEqual({
      updated: 0,
      userIds: [],
      matches: new Map([[1, [series]]]),
    })
  })

  it('stores the series id on a new junction', async () => {
    const { db } = await runSonarr([])
    expect(db.bulkAddWatchlistToSonarrInstances).toHaveBeenCalledWith([
      {
        watchlist_id: 1,
        sonarr_instance_id: 3,
        status: 'grabbed',
        is_primary: true,
        sonarr_series_id: 42,
      },
    ])
  })
})
