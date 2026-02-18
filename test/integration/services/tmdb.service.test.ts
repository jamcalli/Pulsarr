/**
 * Integration tests for TmdbService
 *
 * Tests the real TMDB service methods with MSW intercepting HTTP calls.
 * Verifies response parsing, error handling, and data transformation.
 */

import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

describe('TmdbService Integration', () => {
  let fastify: FastifyInstance

  beforeAll(async () => {
    // Set test API key so isConfigured() returns true
    process.env.tmdbApiKey = 'test-tmdb-read-access-token'
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
    delete process.env.tmdbApiKey
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
    await seedAll(getTestDatabase())
    fastify.tmdb.clearProviderCache()
  })

  describe('getMovieMetadata', () => {
    it('should fetch and parse movie details from TMDB API', async () => {
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
      )

      const result = await fastify.tmdb.getMovieMetadata(550)

      expect(result).not.toBeNull()
      expect(result?.details.id).toBe(550)
      expect(result?.details.title).toBe('Fight Club')
      expect(result?.details.vote_average).toBe(8.4)
      expect(result?.details.vote_count).toBe(25000)
    })

    it('should include watch providers when available for region', async () => {
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
      )

      const result = await fastify.tmdb.getMovieMetadata(550, 'US')

      expect(result).not.toBeNull()
      expect(result?.details.title).toBe('Fight Club')
      expect(result?.watchProviders).toBeDefined()
      expect(result?.watchProviders?.flatrate).toHaveLength(1)
      expect(result?.watchProviders?.flatrate?.[0].provider_name).toBe(
        'Netflix',
      )
    })

    it('should return null for non-existent movie (404)', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/999999', () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(999999)
      expect(result).toBeNull()
    })

    it('should return null when TMDB returns error response', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/movie/999', () => {
          return HttpResponse.json({
            success: false,
            status_code: 34,
            status_message: 'The resource you requested could not be found.',
          })
        }),
      )

      const result = await fastify.tmdb.getMovieMetadata(999)
      expect(result).toBeNull()
    })

    it('should return details without watch providers when provider fetch fails', async () => {
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
            return new HttpResponse(null, { status: 500 })
          },
        ),
      )

      const result = await fastify.tmdb.getMovieMetadata(550)

      // Details should still be returned even though watch providers failed
      expect(result).not.toBeNull()
      expect(result?.details.title).toBe('Fight Club')
      expect(result?.watchProviders).toBeUndefined()
    })
  })

  describe('getTvMetadata', () => {
    it('should fetch and parse TV show details from TMDB API', async () => {
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
      )

      const result = await fastify.tmdb.getTvMetadata(1396)

      expect(result).not.toBeNull()
      expect(result?.details.id).toBe(1396)
      expect(result?.details.name).toBe('Breaking Bad')
      expect(result?.details.vote_average).toBe(8.9)
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

      expect(result).not.toBeNull()
      expect(result?.watchProviders).toBeDefined()
      expect(result?.watchProviders?.flatrate).toHaveLength(1)
      expect(result?.watchProviders?.flatrate?.[0].provider_name).toBe(
        'Netflix',
      )
    })

    it('should return null for non-existent TV show (404)', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/tv/999999', () => {
          return new HttpResponse(null, { status: 404 })
        }),
      )

      const result = await fastify.tmdb.getTvMetadata(999999)
      expect(result).toBeNull()
    })
  })

  describe('getWatchProviders', () => {
    it('should fetch watch providers for a movie by region', async () => {
      server.use(
        http.get(
          'https://api.themoviedb.org/3/movie/550/watch/providers',
          () => {
            return HttpResponse.json({
              id: 550,
              results: {
                US: {
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
      expect(result?.flatrate?.[0].provider_name).toBe('Netflix')
      expect(result?.rent).toHaveLength(1)
      expect(result?.rent?.[0].provider_name).toBe('Amazon Video')
    })

    it('should return null when no providers for region', async () => {
      server.use(
        http.get(
          'https://api.themoviedb.org/3/movie/550/watch/providers',
          () => {
            return HttpResponse.json({
              id: 550,
              results: {},
            })
          },
        ),
      )

      const result = await fastify.tmdb.getWatchProviders(550, 'movie', 'US')
      expect(result).toBeNull()
    })
  })

  describe('getAvailableRegions', () => {
    it('should fetch and transform regions from TMDB', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/watch/providers/regions', () => {
          return HttpResponse.json({
            results: [
              { iso_3166_1: 'US', english_name: 'United States' },
              { iso_3166_1: 'GB', english_name: 'United Kingdom' },
              { iso_3166_1: 'CA', english_name: 'Canada' },
            ],
          })
        }),
      )

      const result = await fastify.tmdb.getAvailableRegions()

      expect(result).not.toBeNull()
      expect(result).toHaveLength(3)
      // Verify TMDB format (iso_3166_1/english_name) is transformed to code/name
      expect(result).toEqual(
        expect.arrayContaining([
          { code: 'US', name: 'United States' },
          { code: 'GB', name: 'United Kingdom' },
          { code: 'CA', name: 'Canada' },
        ]),
      )
    })
  })

  describe('findByTvdbId', () => {
    it('should find TV show by TVDB ID', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/find/78804', () => {
          return HttpResponse.json({
            tv_results: [{ id: 1396, name: 'Breaking Bad' }],
            movie_results: [],
          })
        }),
      )

      const result = await fastify.tmdb.findByTvdbId(78804)

      expect(result).not.toBeNull()
      expect(result?.tmdbId).toBe(1396)
      expect(result?.type).toBe('tv')
    })

    it('should find movie by TVDB ID when no TV results', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/find/12345', () => {
          return HttpResponse.json({
            tv_results: [],
            movie_results: [{ id: 550, title: 'Fight Club' }],
          })
        }),
      )

      const result = await fastify.tmdb.findByTvdbId(12345)

      expect(result).not.toBeNull()
      expect(result?.tmdbId).toBe(550)
      expect(result?.type).toBe('movie')
    })

    it('should return null when TVDB ID not found', async () => {
      // Default MSW handler returns empty results for /find/:id
      const result = await fastify.tmdb.findByTvdbId(999999)
      expect(result).toBeNull()
    })

    it('should prioritize TV results over movie results', async () => {
      server.use(
        http.get('https://api.themoviedb.org/3/find/78804', () => {
          return HttpResponse.json({
            tv_results: [{ id: 1396, name: 'Breaking Bad' }],
            movie_results: [{ id: 550, title: 'Fight Club' }],
          })
        }),
      )

      const result = await fastify.tmdb.findByTvdbId(78804)

      expect(result?.tmdbId).toBe(1396)
      expect(result?.type).toBe('tv')
    })
  })
})
