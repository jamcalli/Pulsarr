import { HttpResponse, http } from 'msw'

/**
 * Shared MSW handlers for external API endpoints (TMDB, Radarr Ratings)
 *
 * These handlers provide default responses for common external API calls
 * to prevent MSW warnings about unhandled requests during integration tests.
 *
 * Tests can override these handlers using server.use() for specific scenarios.
 */

/**
 * TMDB API Handlers
 */

export const tmdbMovieDetailsHandler = http.get(
  'https://api.themoviedb.org/3/movie/:id',
  ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      id: Number(id),
      title: 'Test Movie',
      overview: 'Test overview',
      vote_average: 7.5,
      vote_count: 1000,
      release_date: '2024-01-01',
    })
  },
)

export const tmdbTvDetailsHandler = http.get(
  'https://api.themoviedb.org/3/tv/:id',
  ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      id: Number(id),
      name: 'Test TV Show',
      overview: 'Test overview',
      vote_average: 8.0,
      vote_count: 2000,
      first_air_date: '2024-01-01',
    })
  },
)

export const tmdbMovieWatchProvidersHandler = http.get(
  'https://api.themoviedb.org/3/movie/:id/watch/providers',
  ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      id: Number(id),
      results: {},
    })
  },
)

export const tmdbTvWatchProvidersHandler = http.get(
  'https://api.themoviedb.org/3/tv/:id/watch/providers',
  ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      id: Number(id),
      results: {},
    })
  },
)

export const tmdbRegionsHandler = http.get(
  'https://api.themoviedb.org/3/watch/providers/regions',
  () => {
    return HttpResponse.json({
      results: [
        { iso_3166_1: 'US', english_name: 'United States' },
        { iso_3166_1: 'GB', english_name: 'United Kingdom' },
      ],
    })
  },
)

export const tmdbFindHandler = http.get(
  'https://api.themoviedb.org/3/find/:id',
  () => {
    return HttpResponse.json({
      tv_results: [],
      movie_results: [],
    })
  },
)

/**
 * Radarr Ratings API Handlers
 */

export const radarrRatingsHandler = http.get(
  'https://api.radarr.video/v1/movie/:id',
  ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      imDbId: `tt${id}`,
      imDbRating: '7.5',
      metacriticRating: '70',
      rottenTomatoesRating: '75',
    })
  },
)

/**
 * Radarr Lookup API Handlers (for test Radarr instances)
 * Matches both test-radarr:7878 and localhost:7878
 */

export const radarrLookupHandler = http.get(
  'http://:host/api/v3/movie/lookup/tmdb',
  ({ request }) => {
    const url = new URL(request.url)
    const tmdbId = url.searchParams.get('tmdbId')
    return HttpResponse.json({
      tmdbId: Number(tmdbId),
      title: 'Test Movie',
      ratings: {
        imdb: { value: 7.5 },
        tmdb: { value: 7.0 },
        metacritic: { value: 70 },
        rottenTomatoes: { value: 75 },
      },
    })
  },
)

/**
 * Export all external API handlers as a collection
 * These are registered globally in msw-setup.ts to prevent unhandled request warnings.
 * Individual tests can override these defaults using server.use()
 */
export const externalApiHandlers = [radarrLookupHandler]
