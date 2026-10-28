import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import { sendMediaAvailable } from '@services/notifications/orchestration/media-available.js'
import type { NotificationDeps } from '@services/notifications/types.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const movie = { type: 'movie' as const, guid: 'tmdb:1', title: 'Test' }

function createTestItem(userId: number): TokenWatchlistItem {
  return {
    id: '10',
    title: 'Test Movie',
    key: 'plex-key-1',
    type: 'movie',
    user_id: userId,
    status: 'grabbed',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function createDeps(watchlistItems: TokenWatchlistItem[]) {
  const progress = { emit: vi.fn() }
  const deps = {
    db: {
      getWatchlistItemsByGuid: vi.fn().mockResolvedValue(watchlistItems),
      getUsersByIds: vi.fn().mockResolvedValue([]),
      updateWatchlistItem: vi.fn().mockResolvedValue(true),
    },
    logger: createMockLogger(),
    config: { notifyOnAvailability: false },
    progress,
    detach: vi.fn(),
  } as unknown as NotificationDeps
  return { deps, progress }
}

describe('sendMediaAvailable', () => {
  it('emits one watchlist status event for every user it records', async () => {
    const { deps, progress } = createDeps([
      createTestItem(1),
      createTestItem(2),
    ])

    await sendMediaAvailable(deps, movie, { isBulkRelease: false })

    expect(progress.emit).toHaveBeenCalledTimes(1)
    expect(progress.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'watchlist',
        metadata: { action: 'status', userIds: [1, 2] },
      }),
    )
  })

  it('looks up watchlist items within the media type', async () => {
    const { deps } = createDeps([])
    const show = { ...movie, type: 'show' as const }

    await sendMediaAvailable(deps, movie, { isBulkRelease: false })
    await sendMediaAvailable(deps, show, { isBulkRelease: false })

    expect(deps.db.getWatchlistItemsByGuid).toHaveBeenNthCalledWith(
      1,
      'tmdb:1',
      'movie',
    )
    expect(deps.db.getWatchlistItemsByGuid).toHaveBeenNthCalledWith(
      2,
      'tmdb:1',
      'show',
    )
  })

  it('emits nothing when no watchlist item matches', async () => {
    const { deps, progress } = createDeps([])

    await sendMediaAvailable(deps, movie, { isBulkRelease: false })

    expect(progress.emit).not.toHaveBeenCalled()
  })
})
