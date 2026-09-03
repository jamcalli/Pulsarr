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
import {
  fetchDetails,
  fetchProviderList,
  fetchRegions,
  fetchWatchProviders,
  findByTvdbId,
  type TmdbApiDeps,
} from './tmdb/api.js'
import {
  fetchPlexRatings,
  fetchRadarrRatings,
  type RadarrRatingsDeps,
} from './tmdb/ratings.js'
import { TmdbRequestQueue } from './tmdb/request-queue.js'

const PROVIDER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

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

  private providerCache = new Map<
    string,
    {
      providers: TmdbWatchProvider[]
      fetchedAt: number
    }
  >()

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
  }

  private get accessToken(): string {
    return this.fastify.config.tmdbApiKey
  }

  private get defaultRegion(): string {
    return this.fastify.config.tmdbRegion || 'US'
  }

  private get ratingsDeps(): RadarrRatingsDeps {
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

      const [details, watchProviders, radarrRatings, plexRatings] =
        await Promise.allSettled([
          fetchDetails(this.api, 'movie', tmdbId),
          fetchWatchProviders(this.api, 'movie', tmdbId, movieRegion),
          fetchRadarrRatings(this.ratingsDeps, tmdbId),
          fetchPlexRatings(this.ratingsDeps, tmdbId),
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

      return {
        details: details.value,
        watchProviders: selectRegion(
          this.settled(watchProviders, 'watch providers for movie', tmdbId),
          movieRegion,
        ),
        radarrRatings: this.settled(
          radarrRatings,
          'Radarr ratings for movie',
          tmdbId,
        ),
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
        fetchPlexRatings(this.ratingsDeps, tmdbId),
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

    const cached = this.providerCache.get(providerRegion)
    if (cached && Date.now() - cached.fetchedAt < PROVIDER_CACHE_TTL_MS) {
      this.log.debug(`Using cached providers for region ${providerRegion}`)
      return cached.providers
    }

    this.log.debug(`Fetching providers for region ${providerRegion} from TMDB`)

    try {
      const [movieResponse, tvResponse] = await Promise.allSettled([
        fetchProviderList(this.api, 'movie', providerRegion),
        fetchProviderList(this.api, 'tv', providerRegion),
      ])

      if (movieResponse.status === 'rejected') {
        this.log.warn(
          { error: movieResponse.reason, region: providerRegion },
          'Failed to fetch movie providers',
        )
      }
      if (tvResponse.status === 'rejected') {
        this.log.warn(
          { error: tvResponse.reason, region: providerRegion },
          'Failed to fetch TV providers',
        )
      }

      if (
        movieResponse.status === 'rejected' &&
        tvResponse.status === 'rejected'
      ) {
        this.log.error(
          `Both movie and TV provider fetches failed for region ${providerRegion}`,
        )
        return null
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

      const providers = Array.from(allProviders.values()).sort(
        (a, b) => a.display_priority - b.display_priority,
      )

      this.providerCache.set(providerRegion, {
        providers,
        fetchedAt: Date.now(),
      })

      return providers
    } catch (error) {
      this.log.error(
        { error, region: providerRegion },
        'Error fetching provider list',
      )
      return null
    }
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
