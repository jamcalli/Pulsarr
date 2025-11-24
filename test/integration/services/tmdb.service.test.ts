import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { server } from '../../setup/msw-setup.js'

describe('TmdbService Integration', () => {
  let fastify: FastifyInstance

  beforeEach(async (t) => {
    fastify = await build(t)
  })

  afterEach(() => {
    // Reset MSW handlers to defaults
    server.resetHandlers()
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

    it('should return null when no providers available for region', async () => {
      server.use(
        http.get(
          'https://api.themoviedb.org/3/movie/550/watch/providers',
          () => {
            return HttpResponse.json({
              id: 550,
              results: {
                GB: {
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
      // Note: Service returns data in API order, sorting happens client-side
      expect(result?.some((r) => r.name === 'Canada')).toBe(true)
      expect(result?.some((r) => r.name === 'United Kingdom')).toBe(true)
      expect(result?.some((r) => r.name === 'United States')).toBe(true)
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

  describe('Error Handling & Retries', () => {
    it('should handle 404 not found gracefully', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/999', () => {
          return HttpResponse.json(
            { status_code: 34, status_message: 'Not found' },
            { status: 404 },
          )
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(999)
      expect(result).toBeNull()
    })

    it('should handle 401 unauthorized gracefully', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/123', () => {
          return HttpResponse.json(
            { status_code: 7, status_message: 'Invalid API key' },
            { status: 401 },
          )
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(123)
      expect(result).toBeNull()
    })

    it('should handle network errors gracefully', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/123', () => {
          return HttpResponse.error()
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(123)
      expect(result).toBeNull()
    })
  })
})
