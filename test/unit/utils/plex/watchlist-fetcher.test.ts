import type { Config } from '@root/types/config.types.js'
import type { Friend, Item, PlexResponse } from '@root/types/plex.types.js'
import { PlexRateLimiter } from '@root/utils/plex/rate-limiter.js'
import {
  fetchSelfWatchlist,
  getOthersWatchlist,
} from '@root/utils/plex/watchlist-fetcher.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

describe('plex/watchlist-fetcher', () => {
  const mockLogger = createMockLogger()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset rate limiter state between tests
    PlexRateLimiter.getInstance().reset()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('fetchSelfWatchlist', () => {
    it('should fetch self watchlist successfully', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    title: 'Test Movie',
                    key: '/library/metadata/12345',
                    type: 'movie',
                    thumb: 'https://example.com/thumb.jpg',
                  },
                ],
                totalSize: 1,
              },
            } as PlexResponse)
          },
        ),
      )

      const config: Config = {
        plexTokens: ['valid-token'],
      } as Config

      const result = await fetchSelfWatchlist(config, mockLogger, 1)

      expect(result.size).toBe(1)
      const items = Array.from(result)
      expect(items[0].title).toBe('Test Movie')
      expect(items[0].id).toBe('12345')
      expect(items[0].user_id).toBe(1)
    })

    it('should return empty set when no tokens configured', async () => {
      const config = {
        plexTokens: [],
      } as unknown as Config

      const result = await fetchSelfWatchlist(config, mockLogger, 1)

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith('No Plex tokens configured')
    })

    it('should return empty set when plexTokens is null', async () => {
      const config = {
        plexTokens: null,
      } as unknown as Config

      const result = await fetchSelfWatchlist(config, mockLogger, 1)

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith('No Plex tokens configured')
    })

    it('should skip falsy tokens', async () => {
      let requestCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            requestCount++
            return HttpResponse.json({
              MediaContainer: { Metadata: [], totalSize: 0 },
            } as PlexResponse)
          },
        ),
      )

      const config: Config = {
        plexTokens: ['valid-token', '', null as never, undefined as never],
      } as Config

      await fetchSelfWatchlist(config, mockLogger, 1)

      expect(requestCount).toBe(1)
    })

    it('should handle pagination', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            callCount++
            if (callCount === 1) {
              return HttpResponse.json({
                MediaContainer: {
                  Metadata: [
                    {
                      title: 'Movie 1',
                      key: '/library/metadata/1',
                      type: 'movie',
                    },
                  ],
                  totalSize: 2,
                },
              } as PlexResponse)
            }
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    title: 'Movie 2',
                    key: '/library/metadata/2',
                    type: 'movie',
                  },
                ],
                totalSize: 2,
              },
            } as PlexResponse)
          },
        ),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await fetchSelfWatchlist(config, mockLogger, 1)

      expect(result.size).toBe(2)
      expect(callCount).toBe(2)
    })

    it('should log info when user has no items', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.json({
              MediaContainer: { Metadata: [], totalSize: 0 },
            } as PlexResponse)
          },
        ),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      await fetchSelfWatchlist(config, mockLogger, 1)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User has no items in their watchlist',
      )
    })

    it('should filter out items without key', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    title: 'With Key',
                    key: '/library/metadata/123',
                    type: 'movie',
                  },
                  {
                    title: 'Without Key',
                    type: 'movie',
                    key: null,
                  },
                ],
                // totalSize should be 1 (filtered count), not 2 (raw count)
                totalSize: 1,
              },
            } as unknown as PlexResponse)
          },
        ),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await fetchSelfWatchlist(config, mockLogger, 1)

      expect(result.size).toBe(1)
      const items = Array.from(result)
      expect(items[0].title).toBe('With Key')
    })

    it('should handle rate limit error by moving to next token', async () => {
      let _token1Calls = 0
      let _token2Calls = 0

      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          ({ request }) => {
            const token = request.headers.get('X-Plex-Token')
            if (token === 'token1') {
              _token1Calls++
              // Return 429 status to trigger rate limit handling
              return new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '0' },
              })
            }
            _token2Calls++
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  { title: 'Movie', key: '/library/metadata/1', type: 'movie' },
                ],
                totalSize: 1,
              },
            } as PlexResponse)
          },
        ),
      )

      const config: Config = {
        plexTokens: ['token1', 'token2'],
      } as Config

      const result = await fetchSelfWatchlist(config, mockLogger, 1)

      expect(result.size).toBe(1)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exhausted'),
      )
    }, 20000)

    it('should fall back to database items on error', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.error()
          },
        ),
      )

      const mockDbItems: Item[] = [
        {
          key: 'db-item-1',
          title: 'DB Movie',
          type: 'movie',
          guids: ['tmdb://12345'],
          genres: ['Action'],
          user_id: 1,
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          thumb: '',
        },
      ]

      const getAllWatchlistItemsForUser = vi.fn().mockResolvedValue(mockDbItems)

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await fetchSelfWatchlist(
        config,
        mockLogger,
        1,
        getAllWatchlistItemsForUser,
      )

      expect(result.size).toBe(1)
      expect(getAllWatchlistItemsForUser).toHaveBeenCalledWith(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Falling back to existing database items for user 1',
      )
    }, 20000)

    it('should handle JSON string guids in fallback items', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.error()
          },
        ),
      )

      const mockDbItems: Item[] = [
        {
          key: 'db-item-1',
          title: 'DB Movie',
          type: 'movie',
          guids: '["tmdb://12345"]' as unknown as string[],
          genres: '["Action"]' as unknown as string[],
          user_id: 1,
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          thumb: '',
        },
      ]

      const getAllWatchlistItemsForUser = vi.fn().mockResolvedValue(mockDbItems)

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await fetchSelfWatchlist(
        config,
        mockLogger,
        1,
        getAllWatchlistItemsForUser,
      )

      const items = Array.from(result)
      expect(items[0].guids).toHaveLength(1)
    })

    it('should log error when database fallback fails', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.error()
          },
        ),
      )

      const getAllWatchlistItemsForUser = vi
        .fn()
        .mockRejectedValue(new Error('DB error'))

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await fetchSelfWatchlist(
        config,
        mockLogger,
        1,
        getAllWatchlistItemsForUser,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error), userId: 1 }),
        'Failed to fetch fallback database items for user',
      )
    })

    it('should strip /children from key', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    title: 'TV Show',
                    key: '/library/metadata/12345/children',
                    type: 'show',
                  },
                ],
                totalSize: 1,
              },
            } as PlexResponse)
          },
        ),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const result = await fetchSelfWatchlist(config, mockLogger, 1)

      const items = Array.from(result)
      expect(items[0].id).toBe('12345')
    })
  })

  describe('getOthersWatchlist', () => {
    it('should fetch watchlists for multiple friends', async () => {
      server.use(
        http.post('https://community.plex.tv/api', ({ request }) => {
          const token = request.headers.get('X-Plex-Token')
          return HttpResponse.json({
            data: {
              user: {
                watchlist: {
                  nodes: [
                    {
                      id: `item-${token}`,
                      title: `Movie for ${token}`,
                      type: 'movie',
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          })
        }),
      )

      const config: Config = {
        plexTokens: ['token1', 'token2'],
      } as Config

      const friend1: Friend & { userId: number } = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }
      const friend2: Friend & { userId: number } = {
        watchlistId: 'user-2',
        username: 'friend2',
        userId: 3,
      }

      const friends = new Set<[Friend & { userId: number }, string]>([
        [friend1, 'token1'],
        [friend2, 'token2'],
      ])

      const result = await getOthersWatchlist(config, mockLogger, friends)

      expect(result.size).toBe(2)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting fetch of watchlists for 2 friends',
      )
    })

    it('should handle empty friends set', async () => {
      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const friends = new Set<[Friend & { userId: number }, string]>()

      const result = await getOthersWatchlist(config, mockLogger, friends)

      expect(result.size).toBe(0)
    })

    it('should handle friend with empty watchlist', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {
              user: {
                watchlist: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          })
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const friend: Friend & { userId: number } = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const friends = new Set<[Friend & { userId: number }, string]>([
        [friend, 'token'],
      ])

      const result = await getOthersWatchlist(config, mockLogger, friends)

      expect(result.size).toBe(1)
      const friendItems = result.get(friend)
      expect(friendItems?.size).toBe(0)
    })

    it('should process friends in batches', async () => {
      const processedFriends: string[] = []

      server.use(
        http.post('https://community.plex.tv/api', async ({ request }) => {
          const body = (await request.json()) as {
            variables: { uuid: string }
          }
          processedFriends.push(body.variables.uuid)
          return HttpResponse.json({
            data: {
              user: {
                watchlist: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          })
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const friends = new Set<[Friend & { userId: number }, string]>()
      for (let i = 0; i < 10; i++) {
        friends.add([
          {
            watchlistId: `user-${i}`,
            username: `friend${i}`,
            userId: i + 2,
          },
          'token',
        ])
      }

      await getOthersWatchlist(config, mockLogger, friends)

      expect(processedFriends).toHaveLength(10)
    })

    it('should handle rate limit error', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          // Return 429 to trigger rate limit handling
          return new HttpResponse(null, {
            status: 429,
            headers: { 'Retry-After': '0' },
          })
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const friend: Friend & { userId: number } = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const friends = new Set<[Friend & { userId: number }, string]>([
        [friend, 'token'],
      ])

      const result = await getOthersWatchlist(config, mockLogger, friends)

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exhausted'),
      )
    })

    it('should handle generic error', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          // Return 500 error
          return new HttpResponse(null, { status: 500 })
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const friend: Friend & { userId: number } = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }

      const friends = new Set<[Friend & { userId: number }, string]>([
        [friend, 'token'],
      ])

      const result = await getOthersWatchlist(config, mockLogger, friends)

      // When getWatchlistForUser encounters retryable errors, it eventually returns empty Set
      // The user is still added to the map with empty items (success = true)
      expect(result.size).toBe(1)
      expect(result.get(friend)?.size).toBe(0)
    })

    it('should log statistics about fetched watchlists', async () => {
      server.use(
        http.post('https://community.plex.tv/api', ({ request }) => {
          const token = request.headers.get('X-Plex-Token')
          if (token === 'token1') {
            return HttpResponse.json({
              data: {
                user: {
                  watchlist: {
                    nodes: [
                      { id: 'item-1', title: 'Movie 1', type: 'movie' },
                      { id: 'item-2', title: 'Movie 2', type: 'movie' },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            })
          }
          return HttpResponse.json({
            data: {
              user: {
                watchlist: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          })
        }),
      )

      const config: Config = {
        plexTokens: ['token'],
      } as Config

      const friend1: Friend & { userId: number } = {
        watchlistId: 'user-1',
        username: 'friend1',
        userId: 2,
      }
      const friend2: Friend & { userId: number } = {
        watchlistId: 'user-2',
        username: 'friend2',
        userId: 3,
      }

      const friends = new Set<[Friend & { userId: number }, string]>([
        [friend1, 'token1'],
        [friend2, 'token2'],
      ])

      await getOthersWatchlist(config, mockLogger, friends)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "Others' watchlist fetched successfully with 2 total items from 1 friend (1 friend with empty watchlist)",
        ),
      )
    })
  })
})
