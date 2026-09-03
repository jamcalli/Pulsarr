import type {
  TmdbFindResponse,
  TmdbRegionResult,
  TmdbWatchProvider,
  TmdbWatchProvidersResponse,
} from '@root/types/tmdb.types.js'
import { isTmdbError } from '@root/types/tmdb.types.js'
import type {
  TmdbMovieDetails,
  TmdbRegion,
  TmdbTvDetails,
} from '@schemas/tmdb/tmdb.schema.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import type { TmdbRequestQueue } from './request-queue.js'

const BASE_URL = 'https://api.themoviedb.org/3'

export interface TmdbApiDeps {
  queue: TmdbRequestQueue
  accessToken: () => string
  log: FastifyBaseLogger
}

export async function getJson<T>(
  deps: TmdbApiDeps,
  path: string,
  label: string,
): Promise<T | null> {
  const response = await deps.queue.fetch(`${BASE_URL}${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Authorization: `Bearer ${deps.accessToken()}`,
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      deps.log.debug(`Not found in TMDB: ${label}`)
      return null
    }
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (typeof data === 'object' && data !== null && isTmdbError(data)) {
    deps.log.warn(
      { status_message: data.status_message },
      `TMDB API returned an error for ${label}`,
    )
    return null
  }

  return data as T
}

export function fetchDetails(
  deps: TmdbApiDeps,
  kind: 'movie',
  tmdbId: number,
): Promise<TmdbMovieDetails | null>
export function fetchDetails(
  deps: TmdbApiDeps,
  kind: 'tv',
  tmdbId: number,
): Promise<TmdbTvDetails | null>
export function fetchDetails(
  deps: TmdbApiDeps,
  kind: 'movie' | 'tv',
  tmdbId: number,
): Promise<TmdbMovieDetails | TmdbTvDetails | null> {
  return getJson<TmdbMovieDetails | TmdbTvDetails>(
    deps,
    `/${kind}/${tmdbId}`,
    `${kind} ${tmdbId}`,
  )
}

export function fetchWatchProviders(
  deps: TmdbApiDeps,
  kind: 'movie' | 'tv',
  tmdbId: number,
  region?: string,
): Promise<TmdbWatchProvidersResponse | null> {
  const query = region ? `?watch_region=${region}` : ''

  return getJson<TmdbWatchProvidersResponse>(
    deps,
    `/${kind}/${tmdbId}/watch/providers${query}`,
    `watch providers for ${kind} ${tmdbId}`,
  )
}

export async function fetchProviderList(
  deps: TmdbApiDeps,
  kind: 'movie' | 'tv',
  region: string,
): Promise<TmdbWatchProvider[]> {
  const data = await getJson<{ results?: TmdbWatchProvider[] }>(
    deps,
    `/watch/providers/${kind}?watch_region=${region}`,
    `${kind} providers in ${region}`,
  )

  if (!data || !Array.isArray(data.results)) {
    return []
  }

  return data.results
}

export async function fetchRegions(
  deps: TmdbApiDeps,
): Promise<TmdbRegion[] | null> {
  const data = await getJson<{ results?: TmdbRegionResult[] }>(
    deps,
    '/watch/providers/regions',
    'watch provider regions',
  )

  if (!data || !Array.isArray(data.results)) {
    return null
  }

  return data.results.map((region) => ({
    code: region.iso_3166_1,
    name: region.english_name,
  }))
}

export async function findByTvdbId(
  deps: TmdbApiDeps,
  tvdbId: number,
): Promise<{ tmdbId: number; type: 'movie' | 'tv' } | null> {
  const data = await getJson<TmdbFindResponse>(
    deps,
    `/find/${tvdbId}?external_source=tvdb_id`,
    `TVDB ID ${tvdbId}`,
  )

  if (!data) {
    return null
  }

  if (data.tv_results && data.tv_results.length > 0) {
    return { tmdbId: data.tv_results[0].id, type: 'tv' }
  }

  if (data.movie_results && data.movie_results.length > 0) {
    return { tmdbId: data.movie_results[0].id, type: 'movie' }
  }

  deps.log.debug(`No results found for TVDB ID ${tvdbId}`)
  return null
}
