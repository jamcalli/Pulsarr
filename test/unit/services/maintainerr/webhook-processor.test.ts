import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  type MaintainerrMediaItem,
  processMaintainerrHandledItems,
} from '@services/maintainerr/webhook-processor.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

type WatchlistRow = Awaited<
  ReturnType<DatabaseService['getWatchlistItemsWithUsersByGuids']>
>[number]

function makeRow(overrides: Partial<WatchlistRow> = {}): WatchlistRow {
  return {
    id: 1,
    user_id: 1,
    key: 'plex-key-1',
    title: 'A Sample Movie',
    type: 'movie',
    thumb: null,
    guids: ['imdb:tt0111161', 'tmdb:278'],
    genres: [],
    status: 'grabbed',
    username: 'alice',
    ...overrides,
  }
}

describe('processMaintainerrHandledItems', () => {
  let mockDb: DatabaseService
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDb = {
      getWatchlistItemsWithUsersByGuids: vi.fn().mockResolvedValue([]),
      excludeWatchlistItem: vi.fn().mockResolvedValue(1),
    } as unknown as DatabaseService
  })

  const deps = (mode: 'watchlisters' | 'global' = 'watchlisters') => ({
    db: mockDb,
    logger: mockLogger,
    mode,
  })

  it('excludes every current watchlister of a matched item', async () => {
    vi.mocked(mockDb.getWatchlistItemsWithUsersByGuids).mockResolvedValue([
      makeRow({ user_id: 1 }),
      makeRow({ id: 2, user_id: 3 }),
    ])
    vi.mocked(mockDb.excludeWatchlistItem).mockResolvedValue(2)

    const result = await processMaintainerrHandledItems(
      [
        {
          mediaServerId: '116021',
          type: 'movie',
          title: 'A Sample Movie',
          providerIds: { imdb: ['tt0111161'], tmdb: ['278'], tvdb: [] },
        },
      ],
      deps(),
    )

    expect(mockDb.getWatchlistItemsWithUsersByGuids).toHaveBeenCalledWith([
      'imdb:tt0111161',
      'tmdb:278',
    ])
    expect(mockDb.excludeWatchlistItem).toHaveBeenCalledWith(
      'plex-key-1',
      [1, 3],
      'A Sample Movie',
      'movie',
      ['imdb:tt0111161', 'tmdb:278'],
    )
    expect(result.created).toBe(2)
  })

  it('skips malformed members and still processes valid items', async () => {
    vi.mocked(mockDb.getWatchlistItemsWithUsersByGuids).mockResolvedValue([
      makeRow({ user_id: 1 }),
    ])
    vi.mocked(mockDb.excludeWatchlistItem).mockResolvedValue(1)

    const items = JSON.parse(
      JSON.stringify([
        null,
        {
          mediaServerId: '1',
          type: 'movie',
          title: 'Bad Ids',
          providerIds: { imdb: 'tt0063350' },
        },
        {
          mediaServerId: '116021',
          type: 'movie',
          title: 'A Sample Movie',
          providerIds: { imdb: ['tt0111161'], tmdb: [], tvdb: [] },
        },
      ]),
    ) as MaintainerrMediaItem[]
    const result = await processMaintainerrHandledItems(items, deps())

    expect(mockDb.getWatchlistItemsWithUsersByGuids).toHaveBeenCalledTimes(1)
    expect(result.created).toBe(1)
  })

  it('writes a single system-user exclusion in global mode', async () => {
    vi.mocked(mockDb.getWatchlistItemsWithUsersByGuids).mockResolvedValue([
      makeRow({ user_id: 1 }),
      makeRow({ id: 2, user_id: 3 }),
    ])

    await processMaintainerrHandledItems(
      [
        {
          mediaServerId: '116021',
          type: 'movie',
          title: 'A Sample Movie',
          providerIds: { imdb: [], tmdb: ['278'], tvdb: [] },
        },
      ],
      deps('global'),
    )

    expect(mockDb.excludeWatchlistItem).toHaveBeenCalledWith(
      'plex-key-1',
      [SYSTEM_USER_ID],
      'A Sample Movie',
      'movie',
      ['imdb:tt0111161', 'tmdb:278'],
    )
  })

  it('skips season, episode, and bare items without touching the db', async () => {
    const items: MaintainerrMediaItem[] = [
      { mediaServerId: '1', type: 'season', providerIds: { tvdb: ['999'] } },
      { mediaServerId: '2', type: 'episode', providerIds: { tvdb: ['998'] } },
      { mediaServerId: '3' },
    ]

    const result = await processMaintainerrHandledItems(items, deps())

    expect(mockDb.getWatchlistItemsWithUsersByGuids).not.toHaveBeenCalled()
    expect(result.created).toBe(0)
  })

  it('skips items with empty provider ids', async () => {
    const result = await processMaintainerrHandledItems(
      [
        {
          mediaServerId: '1',
          type: 'movie',
          providerIds: { imdb: [], tmdb: [], tvdb: [] },
        },
      ],
      deps(),
    )

    expect(mockDb.getWatchlistItemsWithUsersByGuids).not.toHaveBeenCalled()
    expect(result.created).toBe(0)
  })

  it('ignores matched rows of a different type', async () => {
    vi.mocked(mockDb.getWatchlistItemsWithUsersByGuids).mockResolvedValue([
      makeRow({ type: 'show' }),
    ])

    const result = await processMaintainerrHandledItems(
      [
        {
          mediaServerId: '1',
          type: 'movie',
          providerIds: { tmdb: ['278'] },
        },
      ],
      deps(),
    )

    expect(mockDb.excludeWatchlistItem).not.toHaveBeenCalled()
    expect(result.created).toBe(0)
  })

  it('returns zero when nothing on any watchlist matches', async () => {
    const result = await processMaintainerrHandledItems(
      [
        {
          mediaServerId: '1',
          type: 'show',
          providerIds: { tvdb: ['81189'] },
        },
      ],
      deps(),
    )

    expect(mockDb.excludeWatchlistItem).not.toHaveBeenCalled()
    expect(result.created).toBe(0)
  })
})
