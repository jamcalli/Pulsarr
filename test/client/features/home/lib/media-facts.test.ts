import {
  heroMeta,
  type MediaMetadata,
  mediaFacts,
  mediaRatings,
  providerGroups,
  tmdbDay,
} from '@/features/home/lib/media-facts'
import { setFormatLocale } from '@/lib/format'
import type { components } from '@/types/api.js'

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
    const facts = mediaFacts(show)
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

  it('picks the Rotten Tomatoes icon at 60 percent', () => {
    const metadata: MediaMetadata = {
      details: show,
      plexRatings: { rtCritic: 6, rtAudience: 5.9, tmdb: 8.25 },
    }
    expect(mediaRatings(metadata)).toEqual([
      { icon: 'tmdb', name: 'TMDB', value: '8.3', outOf: 10 },
      { icon: 'rt-fresh', name: 'Rotten Tomatoes critics', value: '60%' },
      { icon: 'rt-aud-rotten', name: 'Rotten Tomatoes audience', value: '59%' },
    ])
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
