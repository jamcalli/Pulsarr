import { HttpResponse, http } from 'msw'

const tmdbMovieDetailsHandler = http.get(
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

const tmdbTvDetailsHandler = http.get(
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

const tmdbMovieWatchProvidersHandler = http.get(
  'https://api.themoviedb.org/3/movie/:id/watch/providers',
  ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      id: Number(id),
      results: {},
    })
  },
)

const tmdbTvWatchProvidersHandler = http.get(
  'https://api.themoviedb.org/3/tv/:id/watch/providers',
  ({ params }) => {
    const { id } = params
    return HttpResponse.json({
      id: Number(id),
      results: {},
    })
  },
)

const tmdbRegionsHandler = http.get(
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

const tmdbFindHandler = http.get(
  'https://api.themoviedb.org/3/find/:id',
  () => {
    return HttpResponse.json({
      tv_results: [],
      movie_results: [],
    })
  },
)

const radarrRatingsHandler = http.get(
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

const radarrLookupHandler = http.get(
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

// tag_name stays below any real version so no update notification fires, and the empty body skips the markdown render
const githubReleaseHandler = http.get(
  'https://api.github.com/repos/:owner/:repo/releases/latest',
  () =>
    HttpResponse.json({
      tag_name: 'v0.0.0',
      name: 'Test Release',
      body: '',
      html_url: 'https://github.com/jamcalli/Pulsarr/releases/latest',
      published_at: null,
      draft: false,
      prerelease: false,
    }),
)

const githubMarkdownHandler = http.post('https://api.github.com/markdown', () =>
  HttpResponse.text(''),
)

export const externalApiHandlers = [
  tmdbMovieDetailsHandler,
  tmdbTvDetailsHandler,
  tmdbMovieWatchProvidersHandler,
  tmdbTvWatchProvidersHandler,
  tmdbRegionsHandler,
  tmdbFindHandler,
  radarrRatingsHandler,
  radarrLookupHandler,
  githubReleaseHandler,
  githubMarkdownHandler,
]
