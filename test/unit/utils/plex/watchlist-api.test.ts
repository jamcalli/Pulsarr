import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  Item,
  PlexApiResponse,
  PlexResponse,
} from '@root/types/plex.types.js'
import {
  getWatchlist,
  getWatchlistForUser,
  PlexRateLimiter,
} from '@services/plex-watchlist/index.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

describe('plex/watchlist-api', () => {
  const mockLogger = createMockLogger()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset rate limiter state between tests
    PlexRateLimiter.getInstance().reset()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('getWatchlist', () => {
    it('should fetch watchlist successfully', async () => {
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

      const result = await getWatchlist('valid-token', mockLogger)

      expect(result.MediaContainer.Metadata).toHaveLength(1)
      expect(result.MediaContainer.Metadata[0].title).toBe('Test Movie')
      expect(result.MediaContainer.totalSize).toBe(1)
    })

    it('should throw error when no token provided', async () => {
      await expect(getWatchlist('', mockLogger)).rejects.toThrow(
        'No Plex token provided',
      )
    })

    it('should handle empty MediaContainer by creating defaults', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.json({} as PlexResponse)
          },
        ),
      )

      const result = await getWatchlist('token', mockLogger)

      expect(result.MediaContainer).toBeDefined()
      expect(result.MediaContainer.Metadata).toEqual([])
      expect(result.MediaContainer.totalSize).toBe(0)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plex API returned empty MediaContainer',
      )
    })

    it('should handle missing Metadata array by creating defaults', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.json({
              MediaContainer: { totalSize: 0 },
            } as unknown as PlexResponse)
          },
        ),
      )

      const result = await getWatchlist('token', mockLogger)

      expect(result.MediaContainer.Metadata).toEqual([])
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plex API returned MediaContainer without Metadata array',
      )
    })

    it('should handle pagination with start parameter', async () => {
      let capturedParams: URLSearchParams | undefined

      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          ({ request }) => {
            const url = new URL(request.url)
            capturedParams = url.searchParams
            return HttpResponse.json({
              MediaContainer: { Metadata: [], totalSize: 0 },
            } as PlexResponse)
          },
        ),
      )

      await getWatchlist('token', mockLogger, 100)

      expect(capturedParams?.get('X-Plex-Container-Start')).toBe('100')
      expect(capturedParams?.get('X-Plex-Container-Size')).toBe('100')
    })

    it('should include correct headers in request', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          ({ request }) => {
            capturedHeaders = request.headers
            return HttpResponse.json({
              MediaContainer: { Metadata: [], totalSize: 0 },
            } as PlexResponse)
          },
        ),
      )

      await getWatchlist('test-token', mockLogger)

      expect(capturedHeaders?.get('Accept')).toBe('application/json')
      expect(capturedHeaders?.get('X-Plex-Token')).toBe('test-token')
    })

    it('should handle 429 rate limit with Retry-After header', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            callCount++
            if (callCount === 1) {
              return new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '1' },
              })
            }
            return HttpResponse.json({
              MediaContainer: { Metadata: [], totalSize: 0 },
            } as PlexResponse)
          },
        ),
      )

      vi.useFakeTimers()
      const promise = getWatchlist('token', mockLogger)
      await vi.runAllTimersAsync()
      const result = await promise
      vi.useRealTimers()

      expect(result.MediaContainer).toBeDefined()
      expect(callCount).toBe(2)
    })

    it('should throw RateLimitError when max retries exceeded for 429', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return new HttpResponse(null, { status: 429 })
          },
        ),
      )

      // Don't use fake timers - let it retry naturally and fail
      await expect(getWatchlist('token', mockLogger)).rejects.toMatchObject({
        message: expect.stringContaining('Rate limit exceeded'),
        isRateLimitExhausted: true,
      })
    }, 15000)

    it('should handle 500 error', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return new HttpResponse(null, {
              status: 500,
              statusText: 'Internal Server Error',
            })
          },
        ),
      )

      // Don't use fake timers - just test the error
      await expect(getWatchlist('token', mockLogger)).rejects.toThrow(
        'Plex API error: HTTP 500 - Internal Server Error',
      )
    })

    it('should handle timeout error', async () => {
      // Mock AbortSignal.timeout to return an immediately aborted signal
      const originalTimeout = AbortSignal.timeout
      try {
        AbortSignal.timeout = () => {
          const controller = new AbortController()
          controller.abort(new DOMException('TimeoutError', 'TimeoutError'))
          return controller.signal
        }

        server.use(
          http.get(
            'https://discover.provider.plex.tv/library/sections/watchlist/all',
            async () => {
              // This handler won't be reached due to immediate abort
              return HttpResponse.json({
                MediaContainer: { Metadata: [], totalSize: 0 },
              } as PlexResponse)
            },
          ),
        )

        await expect(getWatchlist('token', mockLogger)).rejects.toThrow()
      } finally {
        AbortSignal.timeout = originalTimeout
      }
    })

    it('should handle network error', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return HttpResponse.error()
          },
        ),
      )

      await expect(getWatchlist('token', mockLogger)).rejects.toThrow()
    }, 20000)

    it('should throw error when content type is not JSON', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/sections/watchlist/all',
          () => {
            return new HttpResponse('Not JSON', {
              headers: { 'Content-Type': 'text/plain' },
            })
          },
        ),
      )

      await expect(getWatchlist('token', mockLogger)).rejects.toThrow(
        'Unexpected content type: text/plain',
      )
    }, 20000)
  })

  describe('getWatchlistForUser', () => {
    const config: Config = {
      plexTokens: ['test-token'],
    } as Config

    const user: Friend = {
      watchlistId: 'user-123',
      username: 'testuser',
      userId: 1,
    }

    it('should fetch watchlist for user successfully', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            data: {
              userV2: {
                watchlist: {
                  nodes: [
                    {
                      id: 'item-1',
                      title: 'Test Movie',
                      type: 'movie',
                    },
                  ],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                },
              },
            },
          } as unknown as PlexApiResponse)
        }),
      )

      const result = await getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
      )

      expect(result.size).toBe(1)
      const items = Array.from(result)
      expect(items[0].title).toBe('Test Movie')
      expect(items[0].key).toBe('item-1')
      expect(items[0].user_id).toBe(1)
    })

    it('should handle pagination', async () => {
      vi.useFakeTimers()
      let callCount = 0
      server.use(
        http.post('https://community.plex.tv/api', () => {
          callCount++
          if (callCount === 1) {
            return HttpResponse.json({
              data: {
                userV2: {
                  watchlist: {
                    nodes: [{ id: 'item-1', title: 'Movie 1', type: 'movie' }],
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: 'cursor-1',
                    },
                  },
                },
              },
            } as unknown as PlexApiResponse)
          }
          return HttpResponse.json({
            data: {
              userV2: {
                watchlist: {
                  nodes: [{ id: 'item-2', title: 'Movie 2', type: 'movie' }],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                },
              },
            },
          } as unknown as PlexApiResponse)
        }),
      )

      const resultPromise = getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
      )
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.size).toBe(2)
      expect(callCount).toBe(2)
      vi.useRealTimers()
    })

    it('should throw error when user object is invalid', async () => {
      const invalidUser = { username: 'test' } as unknown as Friend

      await expect(
        getWatchlistForUser(config, mockLogger, 'token', invalidUser, 1),
      ).rejects.toThrow('Invalid user object provided to getWatchlistForUser')
    })

    it('should send correct GraphQL query', async () => {
      let capturedBody: unknown = null

      server.use(
        http.post('https://community.plex.tv/api', async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({
            data: {
              userV2: {
                watchlist: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          } as unknown as PlexApiResponse)
        }),
      )

      await getWatchlistForUser(config, mockLogger, 'token', user, 1)

      expect(capturedBody).toHaveProperty('query')
      expect((capturedBody as { query: string }).query).toContain(
        'GetWatchlistHub',
      )
      expect(capturedBody).toHaveProperty('variables')
      expect(
        (capturedBody as { variables: { user: { id: string } } }).variables.user
          .id,
      ).toBe('user-123')
    })

    it('should handle 401 error', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return new HttpResponse(null, { status: 401 })
        }),
      )

      const result = await getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
        null,
        0,
        0,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unable to fetch watchlist for user'),
      )
    })

    it('should handle 429 rate limit', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return new HttpResponse(null, { status: 429 })
        }),
      )

      await expect(
        getWatchlistForUser(config, mockLogger, 'token', user, 1, null, 0, 0),
      ).rejects.toThrow('Rate limited by Plex GraphQL (429)')
    })

    it('should set isRateLimitExhausted when max retries reached', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return new HttpResponse(null, { status: 429 })
        }),
      )

      await expect(
        getWatchlistForUser(config, mockLogger, 'token', user, 1, null, 3, 3),
      ).rejects.toHaveProperty('isRateLimitExhausted', true)
    })

    it('should handle GraphQL errors', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.json({
            errors: [{ message: 'GraphQL error' }],
          } as unknown as PlexApiResponse)
        }),
      )

      const result = await getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
        null,
        0,
        0,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unable to fetch watchlist for user'),
      )
    })

    it('should retry on generic error up to maxRetries', async () => {
      vi.useFakeTimers()
      let callCount = 0
      server.use(
        http.post('https://community.plex.tv/api', () => {
          callCount++
          if (callCount < 3) {
            return HttpResponse.error()
          }
          return HttpResponse.json({
            data: {
              userV2: {
                watchlist: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          } as unknown as PlexApiResponse)
        }),
      )

      const resultPromise = getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
        null,
        0,
        2,
      )
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.size).toBe(0)
      expect(callCount).toBe(3)
      vi.useRealTimers()
    })

    it('should fall back to database items when retries exhausted', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.error()
        }),
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

      const result = await getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
        null,
        0,
        0,
        getAllWatchlistItemsForUser,
      )

      expect(result.size).toBe(1)
      expect(getAllWatchlistItemsForUser).toHaveBeenCalledWith(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Falling back to existing database items for user 1',
      )
    })

    it('should handle JSON string guids in fallback items', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.error()
        }),
      )

      const mockDbItems: Item[] = [
        {
          key: 'db-item-1',
          title: 'DB Movie',
          type: 'movie',
          guids: '["tmdb://12345","imdb://tt1234"]' as unknown as string[],
          genres: '["Action","Drama"]' as unknown as string[],
          user_id: 1,
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          thumb: '',
        },
      ]

      const getAllWatchlistItemsForUser = vi.fn().mockResolvedValue(mockDbItems)

      const result = await getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
        null,
        0,
        0,
        getAllWatchlistItemsForUser,
      )

      const items = Array.from(result)
      expect(items[0].guids).toHaveLength(2)
      expect(items[0].genres).toHaveLength(2)
    })

    it('should propagate rate limit error when detected', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return new HttpResponse(null, { status: 429 })
        }),
      )

      // Rate limit error should be propagated (thrown), not returned as empty set
      await expect(
        getWatchlistForUser(config, mockLogger, 'token', user, 1, null, 0, 0),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Rate limited'),
        isRateLimitExhausted: true,
      })
    })

    it('should log error when database fallback fails', async () => {
      server.use(
        http.post('https://community.plex.tv/api', () => {
          return HttpResponse.error()
        }),
      )

      const getAllWatchlistItemsForUser = vi
        .fn()
        .mockRejectedValue(new Error('DB error'))

      const result = await getWatchlistForUser(
        config,
        mockLogger,
        'token',
        user,
        1,
        null,
        0,
        0,
        getAllWatchlistItemsForUser,
      )

      expect(result.size).toBe(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to retrieve existing items from database',
      )
    })
  })
})
