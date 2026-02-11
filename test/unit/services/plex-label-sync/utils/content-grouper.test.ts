import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { groupWatchlistItemsByContent } from '@services/plex-label-sync/utils/content-grouper.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

// Helper to create minimal User objects for testing
function createMockUser(id: number, name: string | null = null): User {
  return {
    id,
    name: name === null ? `user_${id}` : name,
    apprise: null,
    alias: null,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: true,
    notify_plex_mobile: false,
    can_sync: true,
  }
}

describe('content-grouper', () => {
  let mockDb: DatabaseService
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDb = {
      getUsersByIds: vi.fn(),
    } as unknown as DatabaseService
  })

  describe('groupWatchlistItemsByContent', () => {
    it('should group watchlist items by content GUIDs', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
        createMockUser(2, 'bob'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 2,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        allGuids: ['tmdb:123'],
        title: 'Test Movie',
        type: 'movie',
        plexKey: '/library/metadata/1',
      })
      expect(result[0].users).toHaveLength(2)
      expect(result[0].users).toEqual(
        expect.arrayContaining([
          { user_id: 1, username: 'alice', watchlist_id: 100 },
          { user_id: 2, username: 'bob', watchlist_id: 101 },
        ]),
      )
    })

    it('should create separate content items for different GUIDs', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Movie 1',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 1,
          guids: ['tmdb:456'],
          title: 'Movie 2',
          type: 'movie',
          key: '/library/metadata/2',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(2)
      expect(result[0].allGuids).toEqual(['tmdb:123'])
      expect(result[1].allGuids).toEqual(['tmdb:456'])
    })

    it('should merge GUIDs when same content has multiple GUID formats', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
        createMockUser(2, 'bob'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123', 'imdb:tt123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 2,
          guids: ['imdb:tt123', 'tmdb:123'], // Same GUIDs, different order
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      // Should have the same GUIDs (no duplicates even though they appear in both items)
      expect(result[0].allGuids).toEqual(['tmdb:123', 'imdb:tt123'])
    })

    it('should handle string GUID format', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: 'tmdb:123',
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].allGuids).toEqual(['tmdb:123'])
    })

    it('should skip items without GUIDs', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: undefined,
          title: 'No GUID Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Has GUID Movie',
          type: 'movie',
          key: '/library/metadata/2',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Has GUID Movie')
    })

    it('should skip items with empty GUID arrays', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: [],
          title: 'Empty GUID Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(0)
    })

    it('should use first non-null Plex key when merging content', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
        createMockUser(2, 'bob'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: null,
        },
        {
          id: 101,
          user_id: 2,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].plexKey).toBe('/library/metadata/1')
    })

    it('should use first Plex key when available', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
        createMockUser(2, 'bob'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 2,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/2',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].plexKey).toBe('/library/metadata/1')
    })

    it('should fallback to user_id when username is not available', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, null),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].users[0].username).toBe('user_1')
    })

    it('should handle user not found in database', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([])

      const watchlistItems = [
        {
          id: 100,
          user_id: 999,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].users[0].username).toBe('user_999')
    })

    it('should separate movies and shows with same GUID', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Content as Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Content as Show',
          type: 'show',
          key: '/library/metadata/2',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(2)
      expect(result.find((r) => r.type === 'movie')).toBeDefined()
      expect(result.find((r) => r.type === 'show')).toBeDefined()
    })

    it('should default type to movie when type is not movie or show', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Unknown Type',
          type: 'unknown',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('movie')
    })

    it('should handle numeric watchlist IDs', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].users[0].watchlist_id).toBe(100)
      expect(typeof result[0].users[0].watchlist_id).toBe('number')
    })

    it('should handle string watchlist IDs and convert to numbers', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
      ])

      const watchlistItems = [
        {
          id: '200',
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].users[0].watchlist_id).toBe(200)
      expect(typeof result[0].users[0].watchlist_id).toBe('number')
    })

    it('should handle empty watchlist items array', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([])

      const result = await groupWatchlistItemsByContent([], mockDb, mockLogger)

      expect(result).toHaveLength(0)
    })

    it('should sort GUIDs consistently for grouping key', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
        createMockUser(2, 'bob'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['imdb:tt123', 'tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 2,
          guids: ['tmdb:123', 'imdb:tt123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      // Should group together despite GUID order differences
      expect(result).toHaveLength(1)
      expect(result[0].users).toHaveLength(2)
    })

    it('should handle multiple users for same content', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
        createMockUser(2, 'bob'),
        createMockUser(3, 'charlie'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Popular Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 2,
          guids: ['tmdb:123'],
          title: 'Popular Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 102,
          user_id: 3,
          guids: ['tmdb:123'],
          title: 'Popular Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(1)
      expect(result[0].users).toHaveLength(3)
      expect(result[0].users.map((u) => u.username)).toEqual(
        expect.arrayContaining(['alice', 'bob', 'charlie']),
      )
    })

    it('should filter out users not in watchlist from database results', async () => {
      vi.mocked(mockDb.getUsersByIds).mockResolvedValue([
        createMockUser(1, 'alice'),
        createMockUser(2, 'bob'),
        createMockUser(3, 'charlie'),
        createMockUser(4, 'dave'),
      ])

      const watchlistItems = [
        {
          id: 100,
          user_id: 1,
          guids: ['tmdb:123'],
          title: 'Test Movie',
          type: 'movie',
          key: '/library/metadata/1',
        },
        {
          id: 101,
          user_id: 3,
          guids: ['tmdb:456'],
          title: 'Another Movie',
          type: 'movie',
          key: '/library/metadata/2',
        },
      ]

      const result = await groupWatchlistItemsByContent(
        watchlistItems,
        mockDb,
        mockLogger,
      )

      expect(result).toHaveLength(2)
      // Should only have alice and charlie (users 1 and 3), not bob or dave
      expect(result[0].users[0].username).toBe('alice')
      expect(result[1].users[0].username).toBe('charlie')
    })
  })
})
