import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  PlexApiResponse,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { processWatchlistItems } from '@root/utils/plex/processors/watchlist-processor.js'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

describe('plex/processors/watchlist-processor', () => {
  const mockLogger = createMockLogger()
  const config: Config = {
    plexTokens: ['valid-token'],
  } as Config

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('processWatchlistItems', () => {
    it('should process watchlist items for multiple users', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    Guid: [{ id: 'tmdb://123' }],
                    Genre: [{ tag: 'Action' }],
                  },
                ],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const friend1: Friend = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }
      const friend2: Friend = {
        watchlistId: 'user-2',
        username: 'friend2',
        userId: 3,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [
          friend1,
          new Set([
            {
              id: '1',
              key: '1',
              title: 'Movie 1',
              type: 'movie',
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
        [
          friend2,
          new Set([
            {
              id: '2',
              key: '2',
              title: 'Movie 2',
              type: 'movie',
              user_id: 3,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
      ])

      const result = await processWatchlistItems(
        config,
        mockLogger,
        userWatchlistMap,
      )

      expect(result.size).toBe(2)
      expect(result.get(friend1)?.size).toBe(1)
      expect(result.get(friend2)?.size).toBe(1)
    })

    it('should handle empty userWatchlistMap', async () => {
      const userWatchlistMap = new Map()

      const result = await processWatchlistItems(
        config,
        mockLogger,
        userWatchlistMap,
      )

      expect(result.size).toBe(0)
    })

    it('should handle user with no items', async () => {
      const friend: Friend = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [friend, new Set()],
      ])

      const result = await processWatchlistItems(
        config,
        mockLogger,
        userWatchlistMap,
      )

      expect(result.size).toBe(0)
    })

    it('should emit progress updates when progressInfo provided', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    Guid: [{ id: 'tmdb://123' }],
                    Genre: [],
                  },
                ],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const mockProgress = {
        emit: vi.fn(),
        hasActiveConnections: vi.fn().mockReturnValue(true),
      }

      const progressInfo = {
        progress: mockProgress,
        operationId: 'test-op',
        type: 'others-watchlist' as const,
      }

      const friend: Friend = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [
          friend,
          new Set([
            {
              id: '1',
              key: '1',
              title: 'Movie 1',
              type: 'movie',
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
      ])

      await processWatchlistItems(
        config,
        mockLogger,
        userWatchlistMap,
        progressInfo,
      )

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'setup',
          progress: 5,
          message: 'Starting to process 1 items',
        }),
      )

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'complete',
          progress: 95,
          message: 'Processed all 1 items - finalizing',
        }),
      )
    })

    it('should log processing info for each user', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const friend: Friend = {
        watchlistId: 'user-1',
        username: 'testuser',
        userId: 2,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [
          friend,
          new Set([
            {
              id: '1',
              key: '1',
              title: 'Movie 1',
              type: 'movie',
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
      ])

      await processWatchlistItems(config, mockLogger, userWatchlistMap)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing 1 watchlist items for user testuser',
      )
    })

    it('should pass correct concurrency limit to toItemsBatch', async () => {
      let concurrentRequests = 0
      let maxConcurrent = 0

      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          async () => {
            concurrentRequests++
            maxConcurrent = Math.max(maxConcurrent, concurrentRequests)
            await new Promise((resolve) => setTimeout(resolve, 100))
            concurrentRequests--
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const friend: Friend = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [
          friend,
          new Set(
            Array.from({ length: 10 }, (_, i) => ({
              id: `${i}`,
              key: `${i}`,
              title: `Movie ${i}`,
              type: 'movie' as const,
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            })),
          ),
        ],
      ])

      await processWatchlistItems(config, mockLogger, userWatchlistMap)

      // Concurrency limit is set to 2 in processWatchlistItems
      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })

    it('should skip users with zero processed items', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return new HttpResponse(null, { status: 404 })
          },
        ),
      )

      const friend: Friend = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [
          friend,
          new Set([
            {
              id: '1',
              key: '1',
              title: 'Not Found Movie',
              type: 'movie',
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
      ])

      const result = await processWatchlistItems(
        config,
        mockLogger,
        userWatchlistMap,
      )

      // User should not be in results since all items returned empty sets
      expect(result.size).toBe(0)
    })

    it('should combine multiple items for single user', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const friend: Friend = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [
          friend,
          new Set([
            {
              id: '1',
              key: '1',
              title: 'Movie 1',
              type: 'movie',
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
            {
              id: '2',
              key: '2',
              title: 'Movie 2',
              type: 'movie',
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
      ])

      const result = await processWatchlistItems(
        config,
        mockLogger,
        userWatchlistMap,
      )

      expect(result.size).toBe(1)
      expect(result.get(friend)?.size).toBe(2)
    })

    it('should track completed items across multiple users', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const mockProgress = {
        emit: vi.fn(),
        hasActiveConnections: vi.fn().mockReturnValue(true),
      }

      const progressInfo = {
        progress: mockProgress,
        operationId: 'test-op',
        type: 'others-watchlist' as const,
      }

      const friend1: Friend = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }
      const friend2: Friend = {
        watchlistId: 'user-2',
        username: 'friend2',
        userId: 3,
      }

      const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>([
        [
          friend1,
          new Set([
            {
              id: '1',
              key: '1',
              title: 'Movie 1',
              type: 'movie',
              user_id: 2,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
        [
          friend2,
          new Set([
            {
              id: '2',
              key: '2',
              title: 'Movie 2',
              type: 'movie',
              user_id: 3,
              status: 'pending' as const,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              guids: [],
              genres: [],
            },
          ]),
        ],
      ])

      await processWatchlistItems(
        config,
        mockLogger,
        userWatchlistMap,
        progressInfo,
      )

      expect(mockProgress.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Starting to process 2 items',
        }),
      )
    })
  })
})
