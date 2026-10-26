import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  DatabaseWatchlistItem,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import { processJunctionUpdates } from '@services/watchlist-status/junction/junction-processor.js'
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

function radarrItem(status: WatchlistStatus): RadarrItem {
  return {
    title: 'Movie',
    type: 'movie',
    guids: ['tmdb:100'],
    status,
    radarr_instance_id: 2,
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
  arr: RadarrItem,
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
    [arr],
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
    expect(config.result).toEqual({ updated: 0, userIds: [] })
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
    expect(config.result).toEqual({ updated: 1, userIds: [7] })
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
})
