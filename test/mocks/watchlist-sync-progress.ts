import type { WatchlistSyncProgress } from '@services/plex-watchlist/progress/sync-progress.js'
import { vi } from 'vitest'

export function createMockSyncProgress() {
  return {
    findingFriends: vi.fn(),
    readingPages: vi.fn(),
    readingFriends: vi.fn(),
    processingItems: vi.fn(),
    rateLimited: vi.fn(),
    saving: vi.fn(),
    complete: vi.fn(),
    failed: vi.fn(),
    lastEvent: vi.fn(),
  } satisfies WatchlistSyncProgress
}
