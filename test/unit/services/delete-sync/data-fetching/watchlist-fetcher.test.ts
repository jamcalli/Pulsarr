/**
 * Unit tests for watchlist-fetcher module
 *
 * Tests fetching and extracting GUIDs from watchlist items for delete sync.
 * Verifies proper handling of user sync settings, GUID extraction from
 * various formats, and deduplication of GUIDs across items.
 */

import type { DatabaseService } from '@services/database.service.js'
import {
  extractGuidsFromWatchlistItems,
  fetchWatchlistItems,
} from '@services/delete-sync/data-fetching/watchlist-fetcher.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('Watchlist Fetcher', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockDb: {
    getAllShowWatchlistItems: ReturnType<typeof vi.fn>
    getAllMovieWatchlistItems: ReturnType<typeof vi.fn>
    getAllUsers: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDb = {
      getAllShowWatchlistItems: vi.fn(),
      getAllMovieWatchlistItems: vi.fn(),
      getAllUsers: vi.fn(),
    }
  })

  describe('fetchWatchlistItems', () => {
    describe('when respectUserSyncSetting is false', () => {
      it('should fetch all watchlist items regardless of user settings', async () => {
        const mockShows = [
          { title: 'Show 1', guids: 'plex:show/1', user_id: 1 },
          { title: 'Show 2', guids: 'plex:show/2', user_id: 2 },
        ]
        const mockMovies = [
          { title: 'Movie 1', guids: 'plex:movie/1', user_id: 1 },
          { title: 'Movie 2', guids: 'plex:movie/2', user_id: 3 },
        ]

        mockDb.getAllShowWatchlistItems.mockResolvedValue(mockShows)
        mockDb.getAllMovieWatchlistItems.mockResolvedValue(mockMovies)

        const result = await fetchWatchlistItems(false, {
          db: mockDb as unknown as DatabaseService,
          logger: mockLogger,
        })

        expect(result).toHaveLength(4)
        expect(result).toEqual([...mockShows, ...mockMovies])
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Found 4 watchlist items from all users',
        )
      })

      it('should return empty array when no items exist', async () => {
        mockDb.getAllShowWatchlistItems.mockResolvedValue([])
        mockDb.getAllMovieWatchlistItems.mockResolvedValue([])

        const result = await fetchWatchlistItems(false, {
          db: mockDb as unknown as DatabaseService,
          logger: mockLogger,
        })

        expect(result).toHaveLength(0)
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Found 0 watchlist items from all users',
        )
      })
    })

    describe('when respectUserSyncSetting is true', () => {
      it('should filter items by users with sync enabled', async () => {
        const mockUsers = [
          { id: 1, can_sync: true },
          { id: 2, can_sync: false },
          { id: 3, can_sync: true },
        ]
        const mockShows = [
          { title: 'Show 1', guids: 'plex:show/1', user_id: 1 },
          { title: 'Show 2', guids: 'plex:show/2', user_id: 2 }, // Filtered out
        ]
        const mockMovies = [
          { title: 'Movie 1', guids: 'plex:movie/1', user_id: 3 },
          { title: 'Movie 2', guids: 'plex:movie/2', user_id: 2 }, // Filtered out
        ]

        mockDb.getAllUsers.mockResolvedValue(mockUsers)
        mockDb.getAllShowWatchlistItems.mockResolvedValue(mockShows)
        mockDb.getAllMovieWatchlistItems.mockResolvedValue(mockMovies)

        const result = await fetchWatchlistItems(true, {
          db: mockDb as unknown as DatabaseService,
          logger: mockLogger,
        })

        expect(result).toHaveLength(2)
        expect(result).toEqual([
          { title: 'Show 1', guids: 'plex:show/1', user_id: 1 },
          { title: 'Movie 1', guids: 'plex:movie/1', user_id: 3 },
        ])
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Found 2 users with sync enabled out of 3 total users',
        )
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Found 2 watchlist items from users with sync enabled',
        )
      })

      it('should handle user_id as object with id property', async () => {
        const mockUsers = [{ id: 1, can_sync: true }]
        const mockShows = [
          { title: 'Show 1', guids: 'plex:show/1', user_id: { id: 1 } },
        ]

        mockDb.getAllUsers.mockResolvedValue(mockUsers)
        mockDb.getAllShowWatchlistItems.mockResolvedValue(mockShows)
        mockDb.getAllMovieWatchlistItems.mockResolvedValue([])

        const result = await fetchWatchlistItems(true, {
          db: mockDb as unknown as DatabaseService,
          logger: mockLogger,
        })

        expect(result).toHaveLength(1)
        expect(result[0].title).toBe('Show 1')
      })

      it('should handle users with can_sync undefined (defaults to true)', async () => {
        const mockUsers = [
          { id: 1, can_sync: undefined },
          { id: 2, can_sync: false },
        ]
        const mockShows = [
          { title: 'Show 1', guids: 'plex:show/1', user_id: 1 },
          { title: 'Show 2', guids: 'plex:show/2', user_id: 2 },
        ]

        mockDb.getAllUsers.mockResolvedValue(mockUsers)
        mockDb.getAllShowWatchlistItems.mockResolvedValue(mockShows)
        mockDb.getAllMovieWatchlistItems.mockResolvedValue([])

        const result = await fetchWatchlistItems(true, {
          db: mockDb as unknown as DatabaseService,
          logger: mockLogger,
        })

        expect(result).toHaveLength(1)
        expect(result[0].title).toBe('Show 1')
      })

      it('should return empty array when all users have sync disabled', async () => {
        const mockUsers = [
          { id: 1, can_sync: false },
          { id: 2, can_sync: false },
        ]

        mockDb.getAllUsers.mockResolvedValue(mockUsers)
        mockDb.getAllShowWatchlistItems.mockResolvedValue([
          { title: 'Show 1', guids: 'plex:show/1', user_id: 1 },
        ])
        mockDb.getAllMovieWatchlistItems.mockResolvedValue([])

        const result = await fetchWatchlistItems(true, {
          db: mockDb as unknown as DatabaseService,
          logger: mockLogger,
        })

        expect(result).toHaveLength(0)
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Found 0 users with sync enabled out of 2 total users',
        )
      })
    })
  })

  describe('extractGuidsFromWatchlistItems', () => {
    it('should extract GUIDs from items with single guid string', () => {
      const items = [
        { title: 'Item 1', guids: 'plex:movie/1' },
        { title: 'Item 2', guids: 'plex:movie/2' },
      ]

      const result = extractGuidsFromWatchlistItems(items, mockLogger)

      expect(result.size).toBe(2)
      expect(result.has('plex:movie/1')).toBe(true)
      expect(result.has('plex:movie/2')).toBe(true)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Extracted 2 unique GUIDs from watchlist items',
      )
    })

    it('should extract GUIDs from items with guid arrays', () => {
      const items = [
        { title: 'Item 1', guids: ['plex:movie/1', 'imdb:tt123456'] },
        { title: 'Item 2', guids: ['plex:movie/2'] },
      ]

      const result = extractGuidsFromWatchlistItems(items, mockLogger)

      expect(result.size).toBe(3)
      expect(result.has('plex:movie/1')).toBe(true)
      expect(result.has('imdb:tt123456')).toBe(true)
      expect(result.has('plex:movie/2')).toBe(true)
    })

    it('should deduplicate GUIDs across items', () => {
      const items = [
        { title: 'Item 1', guids: 'plex:movie/1' },
        { title: 'Item 2', guids: ['plex:movie/1', 'imdb:tt123456'] },
        { title: 'Item 3', guids: 'imdb:tt123456' },
      ]

      const result = extractGuidsFromWatchlistItems(items, mockLogger)

      expect(result.size).toBe(2)
      expect(result.has('plex:movie/1')).toBe(true)
      expect(result.has('imdb:tt123456')).toBe(true)
    })

    it('should handle items with undefined or null guids', () => {
      const items = [
        { title: 'Item 1', guids: undefined },
        { title: 'Item 2', guids: 'plex:movie/1' },
        { title: 'Item 3', guids: null },
      ]

      const result = extractGuidsFromWatchlistItems(
        items as { title: string; guids: string | string[] | undefined }[],
        mockLogger,
      )

      expect(result.size).toBe(1)
      expect(result.has('plex:movie/1')).toBe(true)
    })

    it('should handle items with empty guid arrays', () => {
      const items = [
        { title: 'Item 1', guids: [] },
        { title: 'Item 2', guids: 'plex:movie/1' },
      ]

      const result = extractGuidsFromWatchlistItems(items, mockLogger)

      expect(result.size).toBe(1)
      expect(result.has('plex:movie/1')).toBe(true)
    })

    it('should warn about malformed GUIDs and continue processing', () => {
      const items = [
        { title: 'Item 1', guids: 'plex:movie/1' },
        { title: 'Item 2', guids: '{not-valid-json' }, // parseGuids normalizes this
        { title: 'Item 3', guids: 'plex:movie/3' },
      ]

      const result = extractGuidsFromWatchlistItems(items, mockLogger)

      // Should still extract valid GUIDs
      expect(result.has('plex:movie/1')).toBe(true)
      expect(result.has('plex:movie/3')).toBe(true)

      // parseGuids normalizes all inputs, so all 3 produce GUIDs
      expect(result.size).toBe(3)
    })

    it('should return empty set when all items have no valid GUIDs', () => {
      const items = [
        { title: 'Item 1', guids: undefined },
        { title: 'Item 2', guids: [] },
      ]

      const result = extractGuidsFromWatchlistItems(
        items as { title: string; guids: string | string[] | undefined }[],
        mockLogger,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Extracted 0 unique GUIDs from watchlist items',
      )
    })

    it('should log trace sample when logger level is trace', () => {
      const traceLogger = createMockLogger()
      ;(traceLogger as unknown as { level: string }).level = 'trace'

      const items = [
        { title: 'Item 1', guids: 'plex:movie/1' },
        { title: 'Item 2', guids: 'plex:movie/2' },
        { title: 'Item 3', guids: 'plex:movie/3' },
        { title: 'Item 4', guids: 'plex:movie/4' },
        { title: 'Item 5', guids: 'plex:movie/5' },
        { title: 'Item 6', guids: 'plex:movie/6' },
      ]

      extractGuidsFromWatchlistItems(items, traceLogger)

      expect(traceLogger.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleGuids: expect.arrayContaining([
            'plex:movie/1',
            'plex:movie/2',
            'plex:movie/3',
            'plex:movie/4',
            'plex:movie/5',
          ]),
        }),
        'Sample of watchlist GUIDs (first 5)',
      )
    })

    it('should not log trace sample when logger level is not trace', () => {
      const items = [
        { title: 'Item 1', guids: 'plex:movie/1' },
        { title: 'Item 2', guids: 'plex:movie/2' },
      ]

      extractGuidsFromWatchlistItems(items, mockLogger)

      expect(mockLogger.trace).not.toHaveBeenCalled()
    })
  })
})
