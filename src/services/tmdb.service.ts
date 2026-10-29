import type {
  TmdbWatchProvider,
  TmdbWatchProviderData,
  TmdbWatchProvidersResponse,
} from '@root/types/tmdb.types.js'
import type {
  TmdbMovieMetadata,
  TmdbRegion,
  TmdbTvMetadata,
} from '@schemas/tmdb/tmdb.schema.js'
import { extractTmdbId, extractTvdbId } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { LRUCache } from 'lru-cache'
import {
  fetchDetails,
  fetchProviderList,
  fetchRegions,
  fetchWatchProviders,
  findByTvdbId,
  type TmdbApiDeps,
} from './tmdb/api.js'
import {
  fetchRadarrLookup,
  type RadarrLookupDeps,
} from './tmdb/radarr-lookup.js'
import { fetchPlexRatings } from './tmdb/ratings.js'
import { pickReleaseDates } from './tmdb/release-dates.js'
import { TmdbRequestQueue } from './tmdb/request-queue.js'

export const PROVIDER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const PROVIDER_CACHE_MAX_REGIONS = 50

interface ProviderList {
  providers: TmdbWatchProvider[]
  /** False when the movie or TV list failed and only the other one is in providers. */
  complete: boolean
}

function selectRegion(
  response: TmdbWatchProvidersResponse | undefined,
  region: string,
): TmdbWatchProviderData | undefined {
  if (!response) {
    return undefined
  }

  // TMDB already filters by region, so fall back to the first region it returned
  return response.results[region] || Object.values(response.results)[0]
}

export class TmdbService {
  private readonly log: FastifyBaseLogger
  private readonly api: TmdbApiDeps

  private readonly providerCache: LRUCache<string, ProviderList>

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'TMDB')
    this.api = {
      queue: new TmdbRequestQueue(this.log),
      accessToken: () => this.accessToken,
      log: this.log,
    }
    this.providerCache = fastify.caches.create({
      max: PROVIDER_CACHE_MAX_REGIONS,
      ttl: PROVIDER_CACHE_TTL_MS,
      // A partial list outsizes maxEntrySize, so it answers its callers but is never stored
      maxEntrySize: 1,
      sizeCalculation: ({ complete }) => (complete ? 1 : 2),
      // A clear mid-fetch still answers its waiting callers but is not written back
      ignoreFetchAbort: true,
      fetchMethod: (region) => this.fetchProviders(region),
    })
  }

  private get accessToken(): string {
    return this.fastify.config.tmdbApiKey
  }

  get defaultRegion(): string {
    return this.fastify.config.tmdbRegion || 'US'
  }

  private get lookupDeps(): RadarrLookupDeps {
    return {
      db: this.fastify.db,
      radarrManager: this.fastify.radarrManager,
      log: this.log,
    }
  }

  private settled<T>(
    result: PromiseSettledResult<T | null>,
    label: string,
    tmdbId: number,
  ): T | undefined {
    if (result.status === 'rejected') {
      this.log.warn(
        { error: result.reason, tmdbId },
        `Failed to fetch ${label}`,
      )
      return undefined
    }

    return result.value ?? undefined
  }

  async getMovieMetadata(
    tmdbId: number,
    region?: string,
  ): Promise<TmdbMovieMetadata | null> {
    try {
      const movieRegion = region || this.defaultRegion

      const [details, watchProviders, radarrLookup, plexRatings] =
        await Promise.allSettled([
          fetchDetails(this.api, 'movie', tmdbId),
          fetchWatchProviders(this.api, 'movie', tmdbId, movieRegion),
          fetchRadarrLookup(this.lookupDeps, tmdbId),
          fetchPlexRatings(this.lookupDeps, tmdbId, 'movie'),
        ])

      if (details.status === 'rejected') {
        this.log.error(
          { error: details.reason, tmdbId },
          'Failed to fetch movie details',
        )
        return null
      }

      if (!details.value) {
        this.log.warn(`No movie details found for TMDB ID ${tmdbId}`)
        return null
      }

      const lookup = this.settled(
        radarrLookup,
        'Radarr lookup for movie',
        tmdbId,
      )

      return {
        details: details.value,
        watchProviders: selectRegion(
          this.settled(watchProviders, 'watch providers for movie', tmdbId),
          movieRegion,
        ),
        releaseDates: pickReleaseDates(lookup),
        radarrRatings: lookup?.ratings,
        plexRatings: this.settled(
          plexRatings,
          'Plex ratings for movie',
          tmdbId,
        ),
      }
    } catch (error) {
      this.log.error({ error, tmdbId }, 'Error fetching movie metadata')
      return null
    }
  }

  async getTvMetadata(
    tmdbId: number,
    region?: string,
  ): Promise<TmdbTvMetadata | null> {
    try {
      const tvRegion = region || this.defaultRegion

      const [details, watchProviders, plexRatings] = await Promise.allSettled([
        fetchDetails(this.api, 'tv', tmdbId),
        fetchWatchProviders(this.api, 'tv', tmdbId, tvRegion),
        fetchPlexRatings(this.lookupDeps, tmdbId, 'show'),
      ])

      if (details.status === 'rejected') {
        this.log.error(
          { error: details.reason, tmdbId },
          'Failed to fetch TV details',
        )
        return null
      }

      if (!details.value) {
        this.log.warn(`No TV details found for TMDB ID ${tmdbId}`)
        return null
      }

      return {
        details: details.value,
        watchProviders: selectRegion(
          this.settled(watchProviders, 'watch providers for TV', tmdbId),
          tvRegion,
        ),
        plexRatings: this.settled(plexRatings, 'Plex ratings for TV', tmdbId),
      }
    } catch (error) {
      this.log.error({ error, tmdbId }, 'Error fetching TV metadata')
      return null
    }
  }

  async getMetadataByGuid(
    guid: string,
    type: 'movie' | 'show',
    region?: string,
  ): Promise<{
    kind: 'movie' | 'tv'
    metadata: TmdbMovieMetadata | TmdbTvMetadata
  } | null> {
    const normalized = guid.toLowerCase()
    const tmdbId = extractTmdbId([normalized])
    if (tmdbId > 0) {
      return this.metadataFor(tmdbId, type === 'show' ? 'tv' : 'movie', region)
    }

    const tvdbId = extractTvdbId([normalized])
    if (tvdbId > 0) {
      const found = await this.findByTvdbId(tvdbId)
      if (!found) {
        return null
      }

      return this.metadataFor(found.tmdbId, found.type, region)
    }

    return null
  }

  private async metadataFor(
    tmdbId: number,
    kind: 'movie' | 'tv',
    region?: string,
  ): Promise<{
    kind: 'movie' | 'tv'
    metadata: TmdbMovieMetadata | TmdbTvMetadata
  } | null> {
    const metadata =
      kind === 'movie'
        ? await this.getMovieMetadata(tmdbId, region)
        : await this.getTvMetadata(tmdbId, region)

    return metadata ? { kind, metadata } : null
  }

  async getAvailableRegions(): Promise<TmdbRegion[] | null> {
    if (!this.isConfigured()) {
      this.log.warn('TMDB is not configured, skipping region fetch')
      return null
    }

    try {
      return await fetchRegions(this.api)
    } catch (error) {
      this.log.error({ error }, 'Error fetching TMDB regions')
      return null
    }
  }

  async findByTvdbId(
    tvdbId: number,
  ): Promise<{ tmdbId: number; type: 'movie' | 'tv' } | null> {
    if (!this.isConfigured()) {
      this.log.warn('TMDB is not configured, skipping TVDB ID lookup')
      return null
    }

    try {
      return await findByTvdbId(this.api, tvdbId)
    } catch (error) {
      this.log.error({ error, tvdbId }, 'Error finding content by TVDB ID')
      return null
    }
  }

  async getPosterPath(
    guids: string[] | string | undefined,
    type: 'movie' | 'show',
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      return null
    }

    let tmdbId = extractTmdbId(guids)
    let resolvedType = type

    if (tmdbId === 0) {
      const tvdbId = extractTvdbId(guids)
      if (tvdbId === 0) {
        return null
      }

      const found = await this.findByTvdbId(tvdbId)
      if (!found) {
        return null
      }

      tmdbId = found.tmdbId
      resolvedType = found.type === 'tv' ? 'show' : 'movie'
    }

    try {
      const details =
        resolvedType === 'show'
          ? await fetchDetails(this.api, 'tv', tmdbId)
          : await fetchDetails(this.api, 'movie', tmdbId)

      return details?.poster_path ?? null
    } catch (error) {
      this.log.debug(
        { error, tmdbId, type: resolvedType },
        'Failed to fetch poster path',
      )
      return null
    }
  }

  async getAvailableProviders(
    region?: string,
  ): Promise<TmdbWatchProvider[] | null> {
    if (!this.isConfigured()) {
      this.log.warn('TMDB is not configured, skipping provider fetch')
      return null
    }

    const providerRegion = region || this.defaultRegion

    try {
      return (await this.providerCache.forceFetch(providerRegion)).providers
    } catch (error) {
      this.log.error(
        { error, region: providerRegion },
        'Error fetching provider list',
      )
      return null
    }
  }

  private async fetchProviders(region: string): Promise<ProviderList> {
    this.log.debug(`Fetching providers for region ${region} from TMDB`)

    const [movieResponse, tvResponse] = await Promise.allSettled([
      fetchProviderList(this.api, 'movie', region),
      fetchProviderList(this.api, 'tv', region),
    ])

    if (movieResponse.status === 'rejected') {
      this.log.warn(
        { error: movieResponse.reason, region },
        'Failed to fetch movie providers',
      )
    }
    if (tvResponse.status === 'rejected') {
      this.log.warn(
        { error: tvResponse.reason, region },
        'Failed to fetch TV providers',
      )
    }

    if (
      movieResponse.status === 'rejected' &&
      tvResponse.status === 'rejected'
    ) {
      throw new Error(
        `Both movie and TV provider fetches failed for region ${region}`,
      )
    }

    const allProviders = new Map<number, TmdbWatchProvider>()

    if (movieResponse.status === 'fulfilled') {
      for (const provider of movieResponse.value) {
        allProviders.set(provider.provider_id, provider)
      }
    }

    if (tvResponse.status === 'fulfilled') {
      for (const provider of tvResponse.value) {
        if (!allProviders.has(provider.provider_id)) {
          allProviders.set(provider.provider_id, provider)
        }
      }
    }

    return {
      providers: Array.from(allProviders.values()).sort(
        (a, b) => a.display_priority - b.display_priority,
      ),
      complete:
        movieResponse.status === 'fulfilled' &&
        tvResponse.status === 'fulfilled',
    }
  }

  /** Drops every region's provider list after the default region changed. */
  applyRegionChange(): void {
    this.log.info('TMDB region changed, clearing provider cache')
    this.clearProviderCache()
  }

  clearProviderCache(region?: string): void {
    if (region) {
      this.providerCache.delete(region)
      this.log.debug(`Cleared provider cache for region ${region}`)
    } else {
      this.providerCache.clear()
      this.log.debug('Cleared all provider cache')
    }
  }

  async getWatchProviders(
    tmdbId: number,
    type: 'movie' | 'tv',
    region?: string,
  ): Promise<TmdbWatchProviderData | null> {
    if (!this.isConfigured()) {
      this.log.warn('TMDB service not configured, cannot fetch watch providers')
      return null
    }

    const targetRegion = region || this.defaultRegion
    const response = await fetchWatchProviders(this.api, type, tmdbId)

    return response?.results[targetRegion] ?? null
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.accessToken.trim() !== '')
  }
}
