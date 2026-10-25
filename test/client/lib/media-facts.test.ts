import { setFormatLocale } from '@/lib/format'
import {
  heroMeta,
  type MediaMetadata,
  mediaFacts,
  mediaRatings,
  providerGroups,
  tmdbDay,
} from '@/lib/media-facts'
import type { components } from '@/types/api.js'

type MovieDetails = components['schemas']['TmdbMovieDetails']
type ShowDetails = components['schemas']['TmdbTvDetails']

const show: ShowDetails = {
  adult: false,
  backdrop_path: null,
  created_by: [],
  episode_run_time: [50, 60],
  first_air_date: '2022-02-18',
  genres: [],
  homepage: null,
  id: 95396,
  in_production: true,
  languages: ['en'],
  last_air_date: '2025-03-21',
  last_episode_to_air: null,
  name: 'Severance',
  next_episode_to_air: null,
  networks: [
    { id: 2552, logo_path: null, name: 'Apple TV+', origin_country: '' },
  ],
  number_of_episodes: 19,
  number_of_seasons: 2,
  origin_country: ['US'],
  original_language: 'en',
  original_name: 'Severance',
  overview: null,
  popularity: 1,
  poster_path: null,
  production_companies: [],
  production_countries: [
    { iso_3166_1: 'US', name: 'United States of America' },
  ],
  seasons: [],
  spoken_languages: [],
  status: 'Returning Series',
  tagline: null,
  type: 'Scripted',
  vote_average: 8.4,
  vote_count: 2000,
}

const movie: MovieDetails = {
  adult: false,
  backdrop_path: null,
  belongs_to_collection: null,
  budget: 0,
  genres: [],
  homepage: null,
  id: 278,
  imdb_id: null,
  origin_country: ['US'],
  original_language: 'en',
  original_title: 'The Shawshank Redemption',
  overview: null,
  popularity: 1,
  poster_path: null,
  production_companies: [],
  production_countries: [],
  release_date: '1994-09-23',
  revenue: 0,
  runtime: 142,
  spoken_languages: [],
  status: 'Released',
  tagline: null,
  title: 'The Shawshank Redemption',
  video: false,
  vote_average: 8.7,
  vote_count: 28000,
}

const movieRatings: components['schemas']['RadarrRatings'] = {
  imdb: { votes: 1, value: 9.3, type: 'user' },
  rottenTomatoes: { votes: 1, value: 89, type: 'user' },
  trakt: { votes: 1, value: 9.1, type: 'user' },
}

describe('media facts', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('reads TMDB dates as local calendar days', () => {
    expect(tmdbDay('2022-02-18')?.getFullYear()).toBe(2022)
    expect(tmdbDay('2022-01-01')?.getMonth()).toBe(0)
    expect(tmdbDay(null)).toBeNull()
    expect(tmdbDay('')).toBeNull()
  })

  it('averages the episode runtime for a show', () => {
    expect(heroMeta(show)).toEqual({
      year: '2022',
      runtime: '55 min per episode',
    })
  })

  it('lists the show facts TMDB filled in', () => {
    const facts = mediaFacts({ details: show })
    expect(facts.map((fact) => fact.label)).toEqual([
      'Seasons',
      'Episodes',
      'Aired',
      'Networks',
      'Type',
      'Status',
      'Language',
      'Countries',
    ])
    expect(facts.find((fact) => fact.label === 'Episodes')?.value).toBe(
      '19, about 10 per season',
    )
    expect(facts.find((fact) => fact.label === 'Aired')?.value).toBe(
      '2022 to 2025',
    )
    expect(facts.find((fact) => fact.label === 'Language')?.value).toBe(
      'English',
    )
  })

  it('lists theatrical, digital and physical release rows', () => {
    const facts = mediaFacts({
      details: movie,
      releaseDates: {
        theatrical: '1994-10-14',
        digital: '1999-03-09',
        physical: '1995-01-27',
      },
    })
    expect(facts.slice(0, 3)).toEqual([
      { label: 'Theatrical (US)', value: 'Oct 14, 1994' },
      { label: 'Digital (US)', value: 'Mar 9, 1999' },
      { label: 'Physical (US)', value: 'Jan 27, 1995' },
    ])
  })

  it('falls back to the primary release date for the theatrical row', () => {
    const facts = mediaFacts({
      details: movie,
      releaseDates: { digital: '1999-03-09' },
    })
    expect(facts.map((fact) => fact.label).slice(0, 2)).toEqual([
      'Theatrical',
      'Digital (US)',
    ])
    expect(facts[0]?.value).toBe('Sep 23, 1994')
  })

  it('shows only the theatrical row without Radarr release dates', () => {
    const labels = mediaFacts({ details: movie }).map((fact) => fact.label)
    expect(labels).toEqual(['Theatrical', 'Status', 'Language'])
  })

  it('shows no release rows when nothing has a date', () => {
    const labels = mediaFacts({
      details: { ...movie, release_date: '' },
      releaseDates: {},
    }).map((fact) => fact.label)
    expect(labels).toEqual(['Status', 'Language'])
  })

  it('picks the Rotten Tomatoes icon at 60 percent', () => {
    const metadata: MediaMetadata = {
      details: show,
      plexRatings: { rtCritic: 6, rtAudience: 5.9, tmdb: 8.25 },
    }
    expect(mediaRatings(metadata, [])).toEqual([
      {
        icon: 'tmdb',
        name: 'TMDB',
        value: '8.3',
        outOf: 10,
        url: 'https://www.themoviedb.org/tv/95396',
      },
      { icon: 'rt-fresh', name: 'Rotten Tomatoes critics', value: '60%' },
      { icon: 'rt-aud-rotten', name: 'Rotten Tomatoes audience', value: '59%' },
    ])
  })

  it('links a movie to TMDB, IMDb and Trakt from its imdb guid', () => {
    const ratings = mediaRatings(
      { details: movie, radarrRatings: movieRatings },
      ['tmdb:278', ' IMDB:tt0111161 '],
    )
    expect(ratings.find((rating) => rating.icon === 'tmdb')?.url).toBe(
      'https://www.themoviedb.org/movie/278',
    )
    expect(ratings.find((rating) => rating.icon === 'imdb')?.url).toBe(
      'https://www.imdb.com/title/tt0111161/',
    )
    expect(ratings.find((rating) => rating.icon === 'trakt')?.url).toBe(
      'https://trakt.tv/movies/tt0111161',
    )
    expect(
      ratings.find((rating) => rating.icon === 'rt-fresh'),
    ).not.toHaveProperty('url')
  })

  it('links a show to TMDB tv without an imdb id', () => {
    const ratings = mediaRatings(
      {
        details: show,
        plexRatings: { tmdb: 8.4, imdb: { rating: 8.7, votes: null } },
      },
      ['tvdb:371980'],
    )
    expect(ratings.find((rating) => rating.icon === 'tmdb')?.url).toBe(
      'https://www.themoviedb.org/tv/95396',
    )
    expect(
      ratings.find((rating) => rating.icon === 'imdb')?.url,
    ).toBeUndefined()
  })

  it('falls back to the TMDB imdb id when no imdb guid exists', () => {
    const ratings = mediaRatings(
      {
        details: { ...movie, imdb_id: 'tt0111161' },
        radarrRatings: movieRatings,
      },
      ['tmdb:278'],
    )
    expect(ratings.find((rating) => rating.icon === 'imdb')?.url).toBe(
      'https://www.imdb.com/title/tt0111161/',
    )
    expect(ratings.find((rating) => rating.icon === 'trakt')?.url).toBe(
      'https://trakt.tv/movies/tt0111161',
    )
  })

  it('drops empty provider groups', () => {
    const metadata: MediaMetadata = {
      details: show,
      watchProviders: {
        flatrate: [],
        buy: [
          {
            display_priority: 1,
            logo_path: null,
            provider_id: 2,
            provider_name: 'Apple TV',
          },
        ],
      },
    }
    expect(providerGroups(metadata).map((group) => group.label)).toEqual([
      'Buy',
    ])
    expect(providerGroups({ details: show })).toEqual([])
  })
})
