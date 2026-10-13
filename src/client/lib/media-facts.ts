import {
  formatCurrency,
  formatDate,
  formatLanguage,
  formatList,
  formatNumber,
  formatPercent,
  formatRuntime,
  formatYear,
} from '@/lib/format'
import type { components } from '@/types/api.js'

export type MediaMetadata = components['schemas']['TmdbContentMetadata']
type MovieDetails = components['schemas']['TmdbMovieDetails']
type ShowDetails = components['schemas']['TmdbTvDetails']
type MediaDetails = MovieDetails | ShowDetails
type WatchProvider = components['schemas']['TmdbWatchProvider']

interface Fact {
  label: string
  value: string
}

export type RatingIcon =
  | 'tmdb'
  | 'imdb'
  | 'rt-fresh'
  | 'rt-rotten'
  | 'rt-aud-fresh'
  | 'rt-aud-rotten'
  | 'metacritic'
  | 'trakt'

export interface Rating {
  icon: RatingIcon
  name: string
  value: string
  /** The scale maximum shown after the value, absent for percentages. */
  outOf?: 10 | 100
}

interface ProviderGroup {
  label: string
  providers: WatchProvider[]
}

const FRESH_RATIO = 0.6

function isMovieDetails(details: MediaDetails): details is MovieDetails {
  return 'title' in details
}

/** TMDB dates are calendar days, read as local midnight so the year does not shift west of UTC. */
export function tmdbDay(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function names(items: Array<{ name: string }>): string | null {
  return items.length > 0 ? formatList(items.map((item) => item.name)) : null
}

export function heroMeta(details: MediaDetails): {
  year: string | null
  runtime: string | null
} {
  if (isMovieDetails(details)) {
    const released = tmdbDay(details.release_date)
    return {
      year: released ? formatYear(released) : null,
      runtime: details.runtime ? formatRuntime(details.runtime) : null,
    }
  }
  const firstAired = tmdbDay(details.first_air_date)
  const episodeMinutes = average(details.episode_run_time)
  return {
    year: firstAired ? formatYear(firstAired) : null,
    runtime: episodeMinutes
      ? `${formatRuntime(episodeMinutes)} per episode`
      : null,
  }
}

function movieFacts(details: MovieDetails): Array<Fact | null> {
  const released = tmdbDay(details.release_date)
  return [
    details.original_title !== details.title
      ? { label: 'Original title', value: details.original_title }
      : null,
    released ? { label: 'Released', value: formatDate(released) } : null,
    details.revenue > 0
      ? { label: 'Revenue', value: formatCurrency(details.revenue, 'USD') }
      : null,
    details.budget > 0
      ? { label: 'Budget', value: formatCurrency(details.budget, 'USD') }
      : null,
  ]
}

function airedRange(details: ShowDetails): string | null {
  const first = tmdbDay(details.first_air_date)
  if (!first) return null
  const last = tmdbDay(details.last_air_date)
  if (!last || formatYear(first) === formatYear(last)) return formatYear(first)
  return `${formatYear(first)} to ${formatYear(last)}`
}

function showFacts(details: ShowDetails): Array<Fact | null> {
  const seasons = details.number_of_seasons
  const episodes = details.number_of_episodes
  const perSeason =
    seasons > 1
      ? `, about ${formatNumber(Math.round(episodes / seasons))} per season`
      : ''
  const aired = airedRange(details)
  const networks = names(details.networks)
  return [
    details.original_name !== details.name
      ? { label: 'Original name', value: details.original_name }
      : null,
    seasons > 0 ? { label: 'Seasons', value: formatNumber(seasons) } : null,
    episodes > 0
      ? { label: 'Episodes', value: `${formatNumber(episodes)}${perSeason}` }
      : null,
    aired ? { label: 'Aired', value: aired } : null,
    networks ? { label: 'Networks', value: networks } : null,
    details.type ? { label: 'Type', value: details.type } : null,
  ]
}

export function mediaFacts(details: MediaDetails): Fact[] {
  const countries = names(details.production_countries)
  const studios = isMovieDetails(details)
    ? names(details.production_companies)
    : null
  const shared: Array<Fact | null> = [
    details.status ? { label: 'Status', value: details.status } : null,
    details.original_language
      ? {
          label: 'Language',
          value: formatLanguage(details.original_language),
        }
      : null,
    countries ? { label: 'Countries', value: countries } : null,
    studios ? { label: 'Studios', value: studios } : null,
  ]
  const own = isMovieDetails(details) ? movieFacts(details) : showFacts(details)
  return [...own, ...shared].filter((fact) => fact !== null)
}

function tenPoint(value: number): string {
  return formatNumber(value, 1)
}

/** Plex reports Rotten Tomatoes on a 10-point scale and Radarr on 100. */
export function mediaRatings(metadata: MediaMetadata): Rating[] {
  const { details } = metadata
  const plex = metadata.plexRatings
  const radarr =
    'radarrRatings' in metadata ? metadata.radarrRatings : undefined
  const ratings: Rating[] = []

  const tmdb =
    plex?.tmdb ?? (details.vote_average > 0 ? details.vote_average : undefined)
  if (tmdb !== undefined) {
    ratings.push({
      icon: 'tmdb',
      name: 'TMDB',
      value: tenPoint(tmdb),
      outOf: 10,
    })
  }

  const imdb = radarr?.imdb?.value ?? plex?.imdb?.rating
  if (imdb !== undefined) {
    ratings.push({
      icon: 'imdb',
      name: 'IMDb',
      value: tenPoint(imdb),
      outOf: 10,
    })
  }

  const critic =
    plex?.rtCritic !== undefined
      ? plex.rtCritic / 10
      : radarr?.rottenTomatoes
        ? radarr.rottenTomatoes.value / 100
        : undefined
  if (critic !== undefined) {
    ratings.push({
      icon: critic >= FRESH_RATIO ? 'rt-fresh' : 'rt-rotten',
      name: 'Rotten Tomatoes critics',
      value: formatPercent(critic),
    })
  }

  if (plex?.rtAudience !== undefined) {
    const audience = plex.rtAudience / 10
    ratings.push({
      icon: audience >= FRESH_RATIO ? 'rt-aud-fresh' : 'rt-aud-rotten',
      name: 'Rotten Tomatoes audience',
      value: formatPercent(audience),
    })
  }

  if (radarr?.metacritic) {
    ratings.push({
      icon: 'metacritic',
      name: 'Metacritic',
      value: formatNumber(Math.round(radarr.metacritic.value)),
      outOf: 100,
    })
  }

  if (radarr?.trakt) {
    ratings.push({
      icon: 'trakt',
      name: 'Trakt',
      value: formatPercent(radarr.trakt.value / 10),
    })
  }

  return ratings
}

/** Empty groups are dropped, so an empty result means nothing to watch on in the region. */
export function providerGroups(metadata: MediaMetadata): ProviderGroup[] {
  const providers = metadata.watchProviders
  return [
    { label: 'Streaming', providers: providers?.flatrate ?? [] },
    { label: 'Rent', providers: providers?.rent ?? [] },
    { label: 'Buy', providers: providers?.buy ?? [] },
  ].filter((group) => group.providers.length > 0)
}
