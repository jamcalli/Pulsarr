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

function movieDetails(id: number) {
  return {
    adult: false,
    backdrop_path: null,
    belongs_to_collection: null,
    budget: 0,
    genres: [],
    homepage: '',
    id,
    imdb_id: null,
    origin_country: [],
    original_language: 'en',
    original_title: 'Test Movie',
    overview: 'Test overview',
    popularity: 1,
    poster_path: null,
    production_companies: [],
    production_countries: [],
    release_date: '2024-01-01',
    revenue: 0,
    runtime: null,
    spoken_languages: [],
    status: 'Released',
    tagline: null,
    title: 'Test Movie',
    video: false,
    vote_average: 7.5,
    vote_count: 1000,
  }
}

function tvDetails(id: number) {
  return {
    adult: false,
    backdrop_path: null,
    created_by: [],
    episode_run_time: [],
    first_air_date: '2008-01-20',
    genres: [],
    homepage: '',
    id,
    in_production: false,
    languages: [],
    last_air_date: null,
    last_episode_to_air: null,
    name: 'Test TV Show',
    next_episode_to_air: null,
    networks: [],
    number_of_episodes: 0,
    number_of_seasons: 0,
    origin_country: [],
    original_language: 'en',
    original_name: 'Test TV Show',
    overview: 'Test overview',
    popularity: 1,
    poster_path: null,
    production_companies: [],
    production_countries: [],
    seasons: [],
    spoken_languages: [],
    status: 'Ended',
    tagline: null,
    type: 'Scripted',
    vote_average: 8,
    vote_count: 2000,
  }
}

describe('TMDB metadata routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
    app.config.tmdbApiKey = 'test-key'
  })

  it('never falls back to the movie namespace when a show lookup misses', async () => {
    const movieRequested = vi.fn()
    server.use(
      http.get('https://api.themoviedb.org/3/tv/1396', () => {
        return new HttpResponse(null, { status: 404 })
      }),
      http.get('https://api.themoviedb.org/3/movie/1396', () => {
        movieRequested()
        return HttpResponse.json(movieDetails(1396))
      }),
    )

    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/metadata/tmdb:1396?type=show',
    })

    expect(response.statusCode).toBe(404)
    expect(movieRequested).not.toHaveBeenCalled()
  })

  it('returns movie metadata for a TMDB guid typed as a movie', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/1396', () => {
        return HttpResponse.json(movieDetails(1396))
      }),
      // the shared lookup mock omits votes and type, which RadarrRatingSourceSchema requires
      http.get('http://:host/api/v3/movie/lookup/tmdb', () => {
        return HttpResponse.json({
          tmdbId: 1396,
          title: 'Test Movie',
          ratings: { imdb: { votes: 100, value: 7.5, type: 'user' } },
        })
      }),
    )

    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/metadata/tmdb:1396?type=movie',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { message: string }
    expect(body.message).toBe('Movie metadata retrieved successfully')
  })

  it('uses the type TMDB resolves for a TVDB guid and ignores the hint', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/find/81189', () => {
        return HttpResponse.json({
          tv_results: [{ id: 1396, name: 'Breaking Bad' }],
          movie_results: [],
        })
      }),
      http.get('https://api.themoviedb.org/3/tv/1396', () => {
        return HttpResponse.json(tvDetails(1396))
      }),
    )

    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/metadata/tvdb:81189?type=movie',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { message: string }
    expect(body.message).toBe('TV show metadata retrieved successfully')
  })

  it('accepts an uppercase guid prefix', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () => {
        return HttpResponse.json(movieDetails(550))
      }),
      http.get('http://:host/api/v3/movie/lookup/tmdb', () => {
        return HttpResponse.json({
          tmdbId: 550,
          title: 'Test Movie',
          ratings: { imdb: { votes: 100, value: 7.5, type: 'user' } },
        })
      }),
    )

    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/metadata/TMDB:550?type=movie',
    })

    expect(response.statusCode).toBe(200)
  })

  it('rejects a guid lookup without a type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/metadata/tmdb:1396',
    })

    expect(response.statusCode).toBe(400)
  })

  it('serves the movie route without a type query', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/550', () => {
        return HttpResponse.json(movieDetails(550))
      }),
      http.get('http://:host/api/v3/movie/lookup/tmdb', () => {
        return HttpResponse.json({
          tmdbId: 550,
          title: 'Test Movie',
          ratings: { imdb: { votes: 100, value: 7.5, type: 'user' } },
        })
      }),
    )

    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/movie/550',
    })

    expect(response.statusCode).toBe(200)
  })

  it('rejects a non-numeric TMDB ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/movie/abc?type=movie',
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 503 when TMDB is not configured', async () => {
    app.config.tmdbApiKey = ''

    const response = await app.inject({
      method: 'GET',
      url: '/v1/tmdb/movie/550?type=movie',
    })

    expect(response.statusCode).toBe(503)
  })
})
