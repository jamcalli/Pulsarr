import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../../helpers/app.js'
import { server } from '../../setup/msw-setup.js'

describe('TmdbService', () => {
  let fastify: FastifyInstance

  beforeEach(async (t) => {
    vi.useFakeTimers()
    fastify = await build(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Rate Limiting & Token Bucket', () => {
    it('should enforce 40 requests per second limit', async () => {
      // Mock TMDB API to track request count
      let requestCount = 0
      const requestTimestamps: number[] = []

      server.use(
        http.get('https://api.themoviedb.org/3/movie/:id', () => {
          requestCount++
          requestTimestamps.push(Date.now())
          return HttpResponse.json({
            id: 123,
            title: 'Test Movie',
            overview: 'Test overview',
            vote_average: 7.5,
            vote_count: 1000,
          })
        }),
      )

      // Fire 50 concurrent requests
      const promises = Array.from({ length: 50 }, (_, i) =>
        fastify.tmdb.getMovieMetadata(i + 1),
      )

      // Process only first batch synchronously
      await vi.advanceTimersByTimeAsync(100)

      // Should have processed at most 40 requests in first window
      expect(requestCount).toBeLessThanOrEqual(40)

      // Advance time to allow remaining requests
      await vi.advanceTimersByTimeAsync(2000)
      await Promise.all(promises)

      // All 50 requests should eventually complete
      expect(requestCount).toBe(50)
    })

    it('should process queued requests in order', async () => {
      const processedIds: number[] = []

      server.use(
        http.get('https://api.themoviedb.org/3/movie/:id', ({ params }) => {
          processedIds.push(Number(params.id))
          return HttpResponse.json({
            id: params.id,
            title: `Movie ${params.id}`,
            overview: 'Test',
            vote_average: 7.0,
            vote_count: 100,
          })
        }),
      )

      // Queue 5 requests
      const promises = [1, 2, 3, 4, 5].map((id) =>
        fastify.tmdb.getMovieMetadata(id),
      )

      await vi.runAllTimersAsync()
      await Promise.all(promises)

      // Requests should be processed in FIFO order
      expect(processedIds).toEqual([1, 2, 3, 4, 5])
    })

    it('should handle concurrent requests without queue overflow', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/:id', ({ params }) => {
          return HttpResponse.json({
            id: params.id,
            title: 'Test',
            overview: 'Test',
            vote_average: 7.0,
            vote_count: 100,
          })
        }),
      )

      // Fire 100 concurrent requests
      const promises = Array.from({ length: 100 }, (_, i) =>
        fastify.tmdb.getMovieMetadata(i + 1),
      )

      await vi.runAllTimersAsync()
      const results = await Promise.all(promises)

      // All requests should complete successfully
      expect(results).toHaveLength(100)
      expect(results.every((r) => r !== null)).toBe(true)
    })
  })

  describe('Retry Logic & Error Handling', () => {
    it('should retry on 429 rate limit with exponential backoff', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/movie/123', () => {
          attemptCount++
          if (attemptCount < 3) {
            return HttpResponse.json(
              { status_code: 25, status_message: 'Rate limit exceeded' },
              { status: 429, headers: { 'Retry-After': '1' } },
            )
          }
          return HttpResponse.json({
            id: 123,
            title: 'Success',
            overview: 'Test',
            vote_average: 7.0,
            vote_count: 100,
          })
        }),
      )

      const promise = fastify.tmdb.getMovieMetadata(123)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(attemptCount).toBe(3)
      expect(result).not.toBeNull()
      expect(result?.details.title).toBe('Success')
    })

    it('should retry on 503 service unavailable', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/movie/123', () => {
          attemptCount++
          if (attemptCount < 2) {
            return new HttpResponse(null, { status: 503 })
          }
          return HttpResponse.json({
            id: 123,
            title: 'Success',
            overview: 'Test',
            vote_average: 7.0,
            vote_count: 100,
          })
        }),
      )

      const promise = fastify.tmdb.getMovieMetadata(123)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(attemptCount).toBe(2)
      expect(result?.details.title).toBe('Success')
    })

    it('should not retry on 404 not found', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/movie/999', () => {
          attemptCount++
          return HttpResponse.json(
            { status_code: 34, status_message: 'Not found' },
            { status: 404 },
          )
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(999)

      expect(attemptCount).toBe(1)
      expect(result).toBeNull()
    })

    it('should not retry on 401 unauthorized', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/movie/123', () => {
          attemptCount++
          return HttpResponse.json(
            { status_code: 7, status_message: 'Invalid API key' },
            { status: 401 },
          )
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(123)

      expect(attemptCount).toBe(1)
      expect(result).toBeNull()
    })

    it('should give up after max retries (3 attempts)', async () => {
      let attemptCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/movie/123', () => {
          attemptCount++
          return new HttpResponse(null, { status: 500 })
        }),
      )

      const promise = fastify.tmdb.getMovieMetadata(123)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(attemptCount).toBe(3)
      expect(result).toBeNull()
    })

    it('should handle network errors gracefully', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/123', () => {
          return HttpResponse.error()
        }),
      )

      const promise = fastify.tmdb.getMovieMetadata(123)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBeNull()
    })
  })

  describe('Provider Caching', () => {
    it('should cache provider list per region', async () => {
      let fetchCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/watch/providers/movie', () => {
          fetchCount++
          return HttpResponse.json({
            results: [
              {
                display_priorities: { US: 1 },
                display_priority: 1,
                logo_path: '/netflix.jpg',
                provider_name: 'Netflix',
                provider_id: 8,
              },
            ],
          })
        }),
      )

      // First call should fetch
      await fastify.tmdb.getAvailableProviders('US')
      expect(fetchCount).toBe(1)

      // Second call should use cache
      await fastify.tmdb.getAvailableProviders('US')
      expect(fetchCount).toBe(1)

      // Different region should fetch again
      await fastify.tmdb.getAvailableProviders('GB')
      expect(fetchCount).toBe(2)
    })

    it('should expire cache after 24 hours', async () => {
      let fetchCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/watch/providers/movie', () => {
          fetchCount++
          return HttpResponse.json({
            results: [
              {
                display_priorities: { US: 1 },
                display_priority: 1,
                logo_path: '/netflix.jpg',
                provider_name: 'Netflix',
                provider_id: 8,
              },
            ],
          })
        }),
      )

      // Initial fetch
      await fastify.tmdb.getAvailableProviders('US')
      expect(fetchCount).toBe(1)

      // Advance time by 23 hours - should still use cache
      vi.advanceTimersByTime(23 * 60 * 60 * 1000)
      await fastify.tmdb.getAvailableProviders('US')
      expect(fetchCount).toBe(1)

      // Advance time by 2 more hours (total 25) - cache should expire
      vi.advanceTimersByTime(2 * 60 * 60 * 1000)
      await fastify.tmdb.getAvailableProviders('US')
      expect(fetchCount).toBe(2)
    })

    it('should not cache on API failure', async () => {
      let fetchCount = 0

      server.use(
        http.get('https://api.themoviedb.org/3/watch/providers/movie', () => {
          fetchCount++
          if (fetchCount === 1) {
            return new HttpResponse(null, { status: 500 })
          }
          return HttpResponse.json({
            results: [
              {
                display_priorities: { US: 1 },
                display_priority: 1,
                logo_path: '/netflix.jpg',
                provider_name: 'Netflix',
                provider_id: 8,
              },
            ],
          })
        }),
      )

      // First call fails
      const result1 = await fastify.tmdb.getAvailableProviders('US')
      expect(result1).toBeNull()
      expect(fetchCount).toBe(1)

      // Second call should retry (not use empty cache)
      const result2 = await fastify.tmdb.getAvailableProviders('US')
      expect(result2).toHaveLength(1)
      expect(fetchCount).toBe(2)
    })
  })

  describe('getMovieMetadata', () => {
    it('should fetch movie details successfully', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/550', () => {
          return HttpResponse.json({
            id: 550,
            title: 'Fight Club',
            overview: 'An insomniac office worker...',
            vote_average: 8.4,
            vote_count: 25000,
            release_date: '1999-10-15',
          })
        }),
        http.get(
          'https://api.themoviedb.org/3/movie/550/watch/providers',
          () => {
            return HttpResponse.json({ id: 550, results: {} })
          },
        ),
        http.get('https://api.radarr.video/v1/movie/550', () => {
          return HttpResponse.json({
            imDbRating: '8.8',
            metacriticRating: '66',
            rottenTomatoesRating: '79',
          })
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(550)

      expect(result).not.toBeNull()
      expect(result?.details.title).toBe('Fight Club')
      expect(result?.details.vote_average).toBe(8.4)
      expect(result?.details.vote_count).toBe(25000)
    })

    it('should include watch providers for specified region', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/550', () => {
          return HttpResponse.json({
            id: 550,
            title: 'Fight Club',
            overview: 'Test',
            vote_average: 8.4,
            vote_count: 25000,
          })
        }),
        http.get(
          'https://api.themoviedb.org/3/movie/550/watch/providers',
          () => {
            return HttpResponse.json({
              id: 550,
              results: {
                US: {
                  link: 'https://www.themoviedb.org/movie/550/watch',
                  flatrate: [
                    {
                      logo_path: '/netflix.jpg',
                      provider_id: 8,
                      provider_name: 'Netflix',
                      display_priority: 0,
                    },
                  ],
                },
              },
            })
          },
        ),
        http.get('https://api.radarr.video/v1/movie/550', () => {
          return HttpResponse.json({})
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(550, 'US')

      expect(result?.watchProviders).toBeDefined()
      expect(result?.watchProviders?.flatrate).toHaveLength(1)
      expect(result?.watchProviders?.flatrate?.[0].provider_name).toBe(
        'Netflix',
      )
    })

    it('should return null for non-existent movie', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/999999', () => {
          return HttpResponse.json(
            { status_code: 34, status_message: 'Not found' },
            { status: 404 },
          )
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(999999)
      expect(result).toBeNull()
    })
  })

  describe('getTvMetadata', () => {
    it('should fetch TV show details successfully', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/tv/1396', () => {
          return HttpResponse.json({
            id: 1396,
            name: 'Breaking Bad',
            overview: 'A high school chemistry teacher...',
            vote_average: 8.9,
            vote_count: 12000,
            first_air_date: '2008-01-20',
          })
        }),
        http.get('https://api.themoviedb.org/3/tv/1396/watch/providers', () => {
          return HttpResponse.json({ id: 1396, results: {} })
        }),
      )

      const result = await fastify.tmdb.getTvMetadata(1396)

      expect(result).not.toBeNull()
      expect(result?.details.name).toBe('Breaking Bad')
      expect(result?.details.vote_average).toBe(8.9)
      expect(result?.details.vote_count).toBe(12000)
    })

    it('should include watch providers when available', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/tv/1396', () => {
          return HttpResponse.json({
            id: 1396,
            name: 'Breaking Bad',
            overview: 'Test',
            vote_average: 8.9,
            vote_count: 12000,
          })
        }),
        http.get('https://api.themoviedb.org/3/tv/1396/watch/providers', () => {
          return HttpResponse.json({
            id: 1396,
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1396/watch',
                flatrate: [
                  {
                    logo_path: '/netflix.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 0,
                  },
                ],
              },
            },
          })
        }),
      )

      const result = await fastify.tmdb.getTvMetadata(1396, 'US')

      expect(result?.watchProviders).toBeDefined()
      expect(result?.watchProviders?.flatrate).toHaveLength(1)
    })
  })

  describe('getWatchProviders', () => {
    it('should fetch watch providers for movie', async () => {
      server.use(
        http.get(
          'https://api.themoviedb.org/3/movie/550/watch/providers',
          () => {
            return HttpResponse.json({
              id: 550,
              results: {
                US: {
                  link: 'https://www.themoviedb.org/movie/550/watch',
                  flatrate: [
                    {
                      logo_path: '/netflix.jpg',
                      provider_id: 8,
                      provider_name: 'Netflix',
                      display_priority: 0,
                    },
                  ],
                  rent: [
                    {
                      logo_path: '/amazon.jpg',
                      provider_id: 10,
                      provider_name: 'Amazon Video',
                      display_priority: 1,
                    },
                  ],
                },
              },
            })
          },
        ),
      )

      const result = await fastify.tmdb.getWatchProviders(550, 'movie', 'US')

      expect(result).not.toBeNull()
      expect(result?.flatrate).toHaveLength(1)
      expect(result?.rent).toHaveLength(1)
    })

    it('should fetch watch providers for TV show', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/tv/1396/watch/providers', () => {
          return HttpResponse.json({
            id: 1396,
            results: {
              US: {
                link: 'https://www.themoviedb.org/tv/1396/watch',
                flatrate: [
                  {
                    logo_path: '/netflix.jpg',
                    provider_id: 8,
                    provider_name: 'Netflix',
                    display_priority: 0,
                  },
                ],
              },
            },
          })
        }),
      )

      const result = await fastify.tmdb.getWatchProviders(1396, 'tv', 'US')

      expect(result).not.toBeNull()
      expect(result?.flatrate).toHaveLength(1)
    })

    it('should return null when no providers available for region', async () => {
      server.use(
        http.get(
          'https://api.themoviedb.org/3/movie/550/watch/providers',
          () => {
            return HttpResponse.json({
              id: 550,
              results: {
                GB: {
                  // Only GB, not US
                  link: 'https://www.themoviedb.org/movie/550/watch',
                  flatrate: [],
                },
              },
            })
          },
        ),
      )

      const result = await fastify.tmdb.getWatchProviders(550, 'movie', 'US')
      expect(result).toBeNull()
    })
  })

  describe('getAvailableRegions', () => {
    it('should fetch and sort regions by name', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/watch/providers/regions', () => {
          return HttpResponse.json({
            results: [
              {
                iso_3166_1: 'GB',
                english_name: 'United Kingdom',
                native_name: 'United Kingdom',
              },
              {
                iso_3166_1: 'US',
                english_name: 'United States',
                native_name: 'United States',
              },
              {
                iso_3166_1: 'CA',
                english_name: 'Canada',
                native_name: 'Canada',
              },
            ],
          })
        }),
      )

      const result = await fastify.tmdb.getAvailableRegions()

      expect(result).not.toBeNull()
      expect(result).toHaveLength(3)
      // Should be sorted alphabetically by name
      expect(result?.[0].name).toBe('Canada')
      expect(result?.[1].name).toBe('United Kingdom')
      expect(result?.[2].name).toBe('United States')
    })
  })

  describe('findByTvdbId', () => {
    it('should find TV show by TVDB ID', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/find/78804', () => {
          return HttpResponse.json({
            tv_results: [
              {
                id: 1396,
                name: 'Breaking Bad',
                overview: 'Test',
                vote_average: 8.9,
                vote_count: 12000,
              },
            ],
            movie_results: [],
          })
        }),
      )

      const result = await fastify.tmdb.findByTvdbId(78804)

      expect(result).not.toBeNull()
      expect(result?.tmdbId).toBe(1396)
      expect(result?.type).toBe('tv')
    })

    it('should return null when TVDB ID not found', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/find/999999', () => {
          return HttpResponse.json({
            tv_results: [],
            movie_results: [],
          })
        }),
      )

      const result = await fastify.tmdb.findByTvdbId(999999)
      expect(result).toBeNull()
    })
  })

  describe('getAvailableProviders', () => {
    it('should filter providers by region', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/watch/providers/movie', () => {
          return HttpResponse.json({
            results: [
              {
                display_priorities: { US: 1, GB: 2 },
                display_priority: 1,
                logo_path: '/netflix.jpg',
                provider_name: 'Netflix',
                provider_id: 8,
              },
              {
                display_priorities: { GB: 1 },
                display_priority: 1,
                logo_path: '/bbc.jpg',
                provider_name: 'BBC iPlayer',
                provider_id: 38,
              },
            ],
          })
        }),
      )

      // US region should get Netflix only
      const usProviders = await fastify.tmdb.getAvailableProviders('US')
      expect(usProviders).not.toBeNull()
      expect(usProviders).toHaveLength(1)
      expect(usProviders?.[0].provider_name).toBe('Netflix')

      // GB region should get both
      const gbProviders = await fastify.tmdb.getAvailableProviders('GB')
      expect(gbProviders).not.toBeNull()
      expect(gbProviders).toHaveLength(2)
    })

    it('should sort providers by display priority', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/watch/providers/movie', () => {
          return HttpResponse.json({
            results: [
              {
                display_priorities: { US: 3 },
                display_priority: 3,
                logo_path: '/hulu.jpg',
                provider_name: 'Hulu',
                provider_id: 15,
              },
              {
                display_priorities: { US: 1 },
                display_priority: 1,
                logo_path: '/netflix.jpg',
                provider_name: 'Netflix',
                provider_id: 8,
              },
              {
                display_priorities: { US: 2 },
                display_priority: 2,
                logo_path: '/amazon.jpg',
                provider_name: 'Amazon Prime',
                provider_id: 9,
              },
            ],
          })
        }),
      )

      const providers = await fastify.tmdb.getAvailableProviders('US')

      expect(providers).not.toBeNull()
      expect(providers).toHaveLength(3)
      expect(providers?.[0].provider_name).toBe('Netflix') // priority 1
      expect(providers?.[1].provider_name).toBe('Amazon Prime') // priority 2
      expect(providers?.[2].provider_name).toBe('Hulu') // priority 3
    })
  })
})
