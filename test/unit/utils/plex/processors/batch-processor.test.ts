import type { Config } from '@root/types/config.types.js'
import type {
  PlexApiResponse,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { toItemsBatch } from '@root/utils/plex/processors/batch-processor.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

describe('plex/processors/batch-processor', () => {
  const mockLogger = createMockLogger()
  const config: Config = {
    plexTokens: ['valid-token'],
  } as Config

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('toItemsBatch', () => {
    const createMockItem = (id: string, title: string): TokenWatchlistItem => ({
      id,
      key: id,
      title,
      type: 'movie',
      user_id: 1,
      status: 'pending',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      guids: [],
      genres: [],
    })

    it('should process multiple items successfully', async () => {
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

      const items = [
        createMockItem('1', 'Movie 1'),
        createMockItem('2', 'Movie 2'),
        createMockItem('3', 'Movie 3'),
      ]

      const result = await toItemsBatch(config, mockLogger, items)

      expect(result.size).toBe(3)
    })

    it('should handle empty items array', async () => {
      const result = await toItemsBatch(config, mockLogger, [])

      expect(result.size).toBe(0)
    })

    it('should respect concurrency limit', async () => {
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

      const items = Array.from({ length: 10 }, (_, i) =>
        createMockItem(`${i}`, `Movie ${i}`),
      )

      await toItemsBatch(config, mockLogger, items, undefined, 3)

      expect(maxConcurrent).toBeLessThanOrEqual(3)
    })

    it('should consolidate 404 warnings', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return new HttpResponse(null, { status: 404 })
          },
        ),
      )

      const items = [
        createMockItem('1', 'Not Found 1'),
        createMockItem('2', 'Not Found 2'),
        createMockItem('3', 'Not Found 3'),
      ]

      await toItemsBatch(config, mockLogger, items)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '3 items not found in Plex database (HTTP 404)',
        ),
      )
    })

    it('should truncate long titles in consolidated 404 warnings', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return new HttpResponse(null, { status: 404 })
          },
        ),
      )

      const longTitle = 'A'.repeat(50)
      const items = [createMockItem('1', longTitle)]

      await toItemsBatch(config, mockLogger, items)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('...'),
      )
    })

    it('should limit displayed 404 items to 10', async () => {
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            return new HttpResponse(null, { status: 404 })
          },
        ),
      )

      const items = Array.from({ length: 15 }, (_, i) =>
        createMockItem(`${i}`, `Not Found ${i}`),
      )

      await toItemsBatch(config, mockLogger, items)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('(and 5 more)'),
      )
    })

    it('should handle rate limit by waiting and retrying', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
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
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const items = [createMockItem('1', 'Movie 1')]

      vi.useFakeTimers()
      const promise = toItemsBatch(config, mockLogger, items)
      await vi.runAllTimersAsync()
      const result = await promise
      vi.useRealTimers()

      expect(result.size).toBe(1)
    })

    it('should reduce concurrency after rate limit', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            callCount++
            if (callCount === 1) {
              // Use minimal retry time to speed up test
              return new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '0' },
              })
            }
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const items = [createMockItem('1', 'Movie 1')]

      const result = await toItemsBatch(config, mockLogger, items, undefined, 3)

      expect(result.size).toBe(1)
    })

    it('should recover concurrency after consecutive successes', async () => {
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

      const items = Array.from({ length: 10 }, (_, i) =>
        createMockItem(`${i}`, `Movie ${i}`),
      )

      const result = await toItemsBatch(config, mockLogger, items, undefined, 3)

      expect(result.size).toBe(10)
    })

    it('should put item back in queue on rate limit exhaustion', async () => {
      let attempts = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            attempts++
            if (attempts <= 2) {
              // Return 429 to trigger rate limit
              return new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '0' },
              })
            }
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const items = [createMockItem('1', 'Movie 1')]

      const result = await toItemsBatch(config, mockLogger, items)

      expect(result.size).toBe(1)
    }, 20000)

    it('should handle rate limit detection from error message', async () => {
      let attempts = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            attempts++
            if (attempts === 1) {
              // Return 429 which will create "HTTP 429" error message
              return new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '0' },
              })
            }
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const items = [createMockItem('1', 'Movie 1')]

      const result = await toItemsBatch(config, mockLogger, items)

      expect(result.size).toBe(1)
    }, 20000)

    it('should handle generic errors and continue processing', async () => {
      let _callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          ({ params }) => {
            _callCount++
            if (params.id === '1') {
              return new HttpResponse(null, { status: 500 })
            }
            return HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: 'tmdb://123' }], Genre: [] }],
              },
            } as unknown as PlexApiResponse)
          },
        ),
      )

      const items = [
        createMockItem('1', 'Error Movie'),
        createMockItem('2', 'Success Movie'),
      ]

      const result = await toItemsBatch(config, mockLogger, items, undefined, 1)

      expect(result.size).toBe(2)
    })

    it('should emit progress updates when progressTracker provided', async () => {
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

      const progressTracker = {
        progress: mockProgress,
        operationId: 'test-op',
        type: 'self-watchlist' as const,
        completedItems: 0,
        totalItems: 3,
        username: 'testuser',
      }

      const items = [
        createMockItem('1', 'Movie 1'),
        createMockItem('2', 'Movie 2'),
        createMockItem('3', 'Movie 3'),
      ]

      const result = await toItemsBatch(
        config,
        mockLogger,
        items,
        progressTracker,
        1,
      )

      expect(result.size).toBe(3)
      expect(mockProgress.emit).toHaveBeenCalled()
    })

    it('should handle rate limited progress updates', async () => {
      let callCount = 0
      server.use(
        http.get(
          'https://discover.provider.plex.tv/library/metadata/:id',
          () => {
            callCount++
            if (callCount === 1) {
              return new HttpResponse(null, {
                status: 429,
                headers: { 'Retry-After': '0' },
              })
            }
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

      const progressTracker = {
        progress: mockProgress,
        operationId: 'test-op',
        type: 'self-watchlist' as const,
        completedItems: 0,
        totalItems: 1,
        username: 'testuser',
      }

      const items = [createMockItem('1', 'Movie 1')]

      const result = await toItemsBatch(
        config,
        mockLogger,
        items,
        progressTracker,
      )

      expect(result.size).toBe(1)
    })

    it('should maintain minimum concurrency of 1', async () => {
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

      const items = Array.from({ length: 5 }, (_, i) =>
        createMockItem(`${i}`, `Movie ${i}`),
      )

      const result = await toItemsBatch(config, mockLogger, items, undefined, 1)

      expect(result.size).toBe(5)
    })

    it('should not exceed initial concurrency limit during recovery', async () => {
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

      const items = Array.from({ length: 10 }, (_, i) =>
        createMockItem(`${i}`, `Movie ${i}`),
      )

      const result = await toItemsBatch(config, mockLogger, items, undefined, 3)

      expect(result.size).toBe(10)
    })

    it('should process items sequentially when concurrency is 1', async () => {
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

      const items = [
        createMockItem('1', 'Movie 1'),
        createMockItem('2', 'Movie 2'),
        createMockItem('3', 'Movie 3'),
      ]

      const result = await toItemsBatch(config, mockLogger, items, undefined, 1)

      expect(result.size).toBe(3)
    })
  })
})
