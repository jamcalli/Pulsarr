import type { Friend, TokenWatchlistItem } from '@root/types/plex.types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

vi.mock('@services/plex-watchlist/enrichment/watchlist-processor.js', () => ({
  processWatchlistItems: vi.fn(
    async (_config: unknown, _log: unknown, items: unknown) => items,
  ),
}))

import {
  type ItemProcessorDeps,
  processAndSaveNewItems,
} from '@services/plex-watchlist/orchestration/item-processor.js'

function friend(userId: number): Friend {
  return { watchlistId: `w${userId}`, username: `user${userId}`, userId }
}

function item(userId: number, key: string): TokenWatchlistItem {
  return {
    id: key,
    title: key,
    key,
    type: 'movie',
    user_id: userId,
    status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function createDeps(inserted: { id: number; user_id: number; key: string }[]) {
  const emit = vi.fn()
  const deps = {
    db: {
      getUser: vi.fn(async (id: number) => ({ id, can_sync: true })),
      createWatchlistItems: vi.fn(async () => inserted),
      syncGenresFromWatchlist: vi.fn(async () => undefined),
    },
    logger: createMockLogger(),
    config: {},
    fastify: {
      progress: { emit, hasActiveConnections: () => false },
      tmdb: { isConfigured: () => false },
    },
    handleLinkedItemsForLabelSync: vi.fn(),
  } as unknown as ItemProcessorDeps
  return { deps, emit }
}

const NEW_ITEMS = new Map([
  [friend(3), new Set([item(3, 'a')])],
  [friend(4), new Set([item(4, 'b')])],
])

describe('processAndSaveNewItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits one watchlist added event for the users whose rows were inserted', async () => {
    const { deps, emit } = createDeps([{ id: 1, user_id: 3, key: 'a' }])

    await processAndSaveNewItems(NEW_ITEMS, false, false, deps)

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'watchlist',
        metadata: { action: 'added', userIds: [3] },
      }),
    )
  })

  it('emits nothing when the insert ignored every row', async () => {
    const { deps, emit } = createDeps([])

    await processAndSaveNewItems(NEW_ITEMS, false, false, deps)

    expect(emit).not.toHaveBeenCalled()
  })

  it('emits only the user whose row was inserted when two users share a key', async () => {
    const { deps, emit } = createDeps([{ id: 2, user_id: 4, key: 'shared' }])
    const sharedKey = new Map([
      [friend(3), new Set([item(3, 'shared')])],
      [friend(4), new Set([item(4, 'shared')])],
    ])

    await processAndSaveNewItems(sharedKey, false, false, deps)

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { action: 'added', userIds: [4] },
      }),
    )
  })
})
