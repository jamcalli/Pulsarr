/**
 * Unit tests for watchlist-fetcher module
 *
 * Tests fetching and extracting GUIDs from watchlist items for delete sync.
 * Verifies proper handling of user sync settings, GUID extraction from
 * various formats, and deduplication of GUIDs across items.
 */

import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  type DeleteSyncWatchlistItem,
  extractGuidsFromWatchlistItems,
  fetchWatchlistItems,
  filterExcludedRoutedItems,
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
      })

      it('should return empty array when no items exist', async () => {
        mockDb.getAllShowWatchlistItems.mockResolvedValue([])
        mockDb.getAllMovieWatchlistItems.mockResolvedValue([])

        const result = await fetchWatchlistItems(false, {
          db: mockDb as unknown as DatabaseService,
          logger: mockLogger,
        })

        expect(result).toHaveLength(0)
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
    })
  })

  describe('filterExcludedRoutedItems', () => {
    const item = (
      overrides: Partial<DeleteSyncWatchlistItem> = {},
    ): DeleteSyncWatchlistItem => ({
      title: 'Item',
      key: 'k1',
      guids: 'tmdb:1',
      status: 'requested',
      user_id: 1,
      ...overrides,
    })

    it('drops routed rows excluded for the owning user', () => {
      const items = [item({ status: 'grabbed', user_id: 1 })]
      const exclusionMap = new Map([['k1', new Set([1])]])

      expect(filterExcludedRoutedItems(items, exclusionMap)).toHaveLength(0)
    })

    it('keeps pending rows even when excluded', () => {
      const items = [item({ status: 'pending', user_id: 1 })]
      const exclusionMap = new Map([['k1', new Set([1])]])

      expect(filterExcludedRoutedItems(items, exclusionMap)).toHaveLength(1)
    })

    it('keeps routed rows that are not excluded', () => {
      const items = [item({ status: 'requested', user_id: 1 })]
      const exclusionMap = new Map([['k1', new Set([2])]])

      expect(filterExcludedRoutedItems(items, exclusionMap)).toHaveLength(1)
    })

    it('drops routed rows under a global exclusion regardless of user', () => {
      const items = [item({ status: 'grabbed', user_id: 5 })]
      const exclusionMap = new Map([['k1', new Set([SYSTEM_USER_ID])]])

      expect(filterExcludedRoutedItems(items, exclusionMap)).toHaveLength(0)
    })

    it('normalizes object-form user_id when matching exclusions', () => {
      const items = [item({ status: 'grabbed', user_id: { id: 1 } })]
      const exclusionMap = new Map([['k1', new Set([1])]])

      expect(filterExcludedRoutedItems(items, exclusionMap)).toHaveLength(0)
    })
  })

  describe('dry-run / real-run parity', () => {
    it('produces the same protected GUID set before and after the cleanup mutation', () => {
      // Routed + excluded: a real run deletes this row before re-reading
      const routedExcluded: DeleteSyncWatchlistItem = {
        title: 'A',
        key: 'kA',
        guids: 'plex:movie/1',
        status: 'grabbed',
        user_id: 1,
      }
      // Pending + globally excluded: never reached *arr, kept in both runs
      const pendingExcluded: DeleteSyncWatchlistItem = {
        title: 'B',
        key: 'kB',
        guids: 'plex:movie/2',
        status: 'pending',
        user_id: 2,
      }
      // Routed + not excluded: kept in both runs
      const routedKept: DeleteSyncWatchlistItem = {
        title: 'C',
        key: 'kC',
        guids: 'plex:movie/3',
        status: 'requested',
        user_id: 3,
      }

      const exclusionMap = new Map<string, Set<number>>([
        ['kA', new Set([1])],
        ['kB', new Set([SYSTEM_USER_ID])],
      ])

      // Dry run: nothing deleted from the DB, exclusions applied in memory
      const drySet = extractGuidsFromWatchlistItems(
        filterExcludedRoutedItems(
          [routedExcluded, pendingExcluded, routedKept],
          exclusionMap,
        ),
        mockLogger,
      )

      // Real run: cleanup already removed routed + excluded rows from the DB
      const realSet = extractGuidsFromWatchlistItems(
        filterExcludedRoutedItems([pendingExcluded, routedKept], exclusionMap),
        mockLogger,
      )

      expect([...drySet].sort()).toEqual([...realSet].sort())
      expect(drySet.has('plex:movie/1')).toBe(false)
      expect(drySet.has('plex:movie/2')).toBe(true)
      expect(drySet.has('plex:movie/3')).toBe(true)
    })
  })
})
