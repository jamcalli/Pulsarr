import type { Config } from '@root/types/config.types.js'
import type {
  PlexApiResponse,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { toItemsSingle } from '@root/utils/plex/processors/single-item.js'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

describe('plex/processors/single-item', () => {
  const mockLogger = createMockLogger()
  const config: Config = {
    plexTokens: ['valid-token'],
  } as Config

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('toItemsSingle', () => {
    const mockItem: TokenWatchlistItem = {
      id: '12345',
      key: '12345',
      title: 'Test Movie',
      type: 'movie',
      user_id: 1,
      status: 'pending',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      guids: [],
      genres: [],
    }

    it('should process item successfully', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    Guid: [{ id: 'tmdb://123' }, { id: 'imdb://tt1234' }],
                    Genre: [{ tag: 'Action' }, { tag: 'Drama' }],
                    thumb: 'https://example.com/thumb.jpg',
                  },
                ],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(1)
      const items = Array.from(result)
      expect(items[0].title).toBe('Test Movie')
      expect(items[0].guids).toHaveLength(2)
      expect(items[0].genres).toHaveLength(2)
    })

    it('should return empty set when no valid tokens configured', async () => {
      const emptyConfig = {
        plexTokens: [],
      } as unknown as Config

      const result = await toItemsSingle(emptyConfig, mockLogger, mockItem)

      expect(result.size).toBe(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'No valid Plex token configured; cannot fetch metadata',
      )
    })

    it('should handle 404 response by returning empty set', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return new HttpResponse(null, { status: 404 })
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Item "Test Movie" not found in Plex database (HTTP 404) - skipping retries',
      )
    })

    it('should collect 404 items when notFoundCollector provided', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return new HttpResponse(null, { status: 404 })
          },
        ),
      )

      const notFoundCollector: string[] = []
      const result = await toItemsSingle(
        config,
        mockLogger,
        mockItem,
        0,
        3,
        undefined,
        notFoundCollector,
      )

      expect(result.size).toBe(0)
      expect(notFoundCollector).toContain('Test Movie')
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('not found in Plex database'),
      )
    })

    it('should handle 429 rate limit with Retry-After header', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            callCount++
            if (callCount === 1) {
              return new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '1' },
              })
            }
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

      vi.useFakeTimers()
      const promise = toItemsSingle(config, mockLogger, mockItem)
      await vi.runAllTimersAsync()
      const result = await promise
      vi.useRealTimers()

      expect(result.size).toBe(1)
      expect(callCount).toBe(2)
    })

    it('should throw RateLimitError when max retries exceeded for 429', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return new HttpResponse(null, { status: 429 })
          },
        ),
      )

      // Don't use fake timers - with retryCount=0 and maxRetries=0, it should fail immediately
      await expect(
        toItemsSingle(config, mockLogger, mockItem, 0, 0),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Rate limit exceeded'),
        isRateLimitExhausted: true,
      })
    })

    it('should handle 500 error', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return new HttpResponse(null, { status: 500 })
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('should retry when missing guids', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            callCount++
            if (callCount === 1) {
              return HttpResponse.json({
                MediaContainer: {
                  Metadata: [
                    {
                      Guid: [],
                      Genre: [],
                    },
                  ],
                },
              } as unknown as PlexApiResponse)
            }
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

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(1)
      expect(callCount).toBe(2)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Found item Test Movie but no GUIDs. Retry 1/3',
      )
    })

    it('should filter out null guids', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    Guid: [
                      { id: 'tmdb://123' },
                      { id: null },
                      {} as { id: string },
                    ],
                    Genre: [],
                  },
                ],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      const items = Array.from(result)
      expect(items.length).toBeGreaterThan(0)
      const item = items[0]
      if (!item) throw new Error('Expected item to be defined')
      expect(item.guids).toHaveLength(1)
      // GUIDs are normalized by normalizeGuid which converts :// to :
      if (!item.guids) throw new Error('Expected guids to be defined')
      expect(item.guids[0]).toBe('tmdb:123')
    })

    it('should filter out non-string genres', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    Guid: [{ id: 'tmdb://123' }],
                    Genre: [{ tag: 'Action' }, { tag: null }, {}],
                  },
                ],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      const items = Array.from(result)
      expect(items.length).toBeGreaterThan(0)
      const item = items[0]
      if (!item) throw new Error('Expected item to be defined')
      expect(item.genres).toBeDefined()
      if (!item.genres) throw new Error('Expected genres to be defined')
      expect(item.genres).toHaveLength(1)
      expect(item.genres[0]).toBe('Action')
    })

    it('should handle invalid response structure', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return HttpResponse.json({} as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(0)
    })

    it('should handle missing MediaContainer.Metadata', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return HttpResponse.json({
              MediaContainer: {},
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(0)
    })

    it('should include correct headers in request', async () => {
      let capturedHeaders: Headers | undefined

      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          ({ request }) => {
            capturedHeaders = request.headers
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      await toItemsSingle(config, mockLogger, mockItem)

      expect(capturedHeaders?.get('Accept')).toBe('application/json')
      expect(capturedHeaders?.get('X-Plex-Token')).toBe('valid-token')
    })

    it('should use item thumb when metadata thumb is missing', async () => {
      const itemWithThumb: TokenWatchlistItem = {
        ...mockItem,
        thumb: 'https://item-thumb.jpg',
      }

      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
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

      const result = await toItemsSingle(config, mockLogger, itemWithThumb)

      const items = Array.from(result)
      expect(items[0].thumb).toBe('https://item-thumb.jpg')
    })

    it('should prefer item thumb over metadata thumb', async () => {
      const itemWithThumb: TokenWatchlistItem = {
        ...mockItem,
        thumb: 'https://item-thumb.jpg',
      }

      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [
                  {
                    Guid: [{ id: 'tmdb://123' }],
                    Genre: [],
                    thumb: 'https://metadata-thumb.jpg',
                  },
                ],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, itemWithThumb)

      const items = Array.from(result)
      expect(items.length).toBeGreaterThan(0)
      // Code prefers item.thumb || metadata.thumb (item first)
      expect(items[0].thumb).toBe('https://item-thumb.jpg')
    })

    it('should handle network error', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return HttpResponse.error()
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(0)
    })

    it('should handle timeout error', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 6000))
            return HttpResponse.json({
              MediaContainer: { Metadata: [] },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(0)
    })

    it('should propagate rate limit error when already exhausted', async () => {
      // Create a rate limit error directly in the flow
      const rateLimitError = new Error('Rate limited') as Error & {
        isRateLimitExhausted: boolean
      }
      rateLimitError.isRateLimitExhausted = true

      // Mock fetch to simulate the condition that triggers rate limit detection
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockRejectedValue(rateLimitError)

      try {
        await expect(
          toItemsSingle(config, mockLogger, mockItem),
        ).rejects.toThrow('Rate limited')

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Rate limit already exhausted'),
        )
      } finally {
        global.fetch = originalFetch
      }
    })

    it('should retry on rate limit error string', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            callCount++
            if (callCount === 1) {
              throw new Error('Rate limit exceeded')
            }
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      vi.useFakeTimers()
      const promise = toItemsSingle(config, mockLogger, mockItem)
      await vi.runAllTimersAsync()
      const result = await promise
      vi.useRealTimers()

      expect(result.size).toBe(1)
    })

    it('should handle 404 in catch block', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            return new HttpResponse(null, {
              status: 404,
              statusText: 'Not Found',
            })
          },
        ),
      )

      const notFoundCollector: string[] = []
      const result = await toItemsSingle(
        config,
        mockLogger,
        mockItem,
        0,
        3,
        undefined,
        notFoundCollector,
      )

      expect(result.size).toBe(0)
      expect(notFoundCollector).toContain('Test Movie')
    })

    it('should retry on Plex API error up to maxRetries', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            callCount++
            if (callCount < 3) {
              throw new Error('Plex API error: HTTP 500 - Server Error')
            }
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(1)
      expect(callCount).toBe(3)
    })

    it('should log final warning when retries exhausted', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/12345',
          () => {
            throw new Error('Plex API error: HTTP 500')
          },
        ),
      )

      const result = await toItemsSingle(config, mockLogger, mockItem)

      expect(result.size).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Found item Test Movie on the watchlist, but we cannot find this in Plex's database after 4 attempts",
        ),
      )
    })
  })
})
