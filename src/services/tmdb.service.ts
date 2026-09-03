import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type {
  TmdbFindResponse,
  TmdbWatchProvider,
  TmdbWatchProviderData,
  TmdbWatchProvidersResponse,
} from '@root/types/tmdb.types.js'
import { isTmdbError } from '@root/types/tmdb.types.js'
import type {
  PlexRatings,
  RadarrRatings,
  TmdbMovieDetails,
  TmdbMovieMetadata,
  TmdbRegion,
  TmdbTvDetails,
  TmdbTvMetadata,
} from '@schemas/tmdb/tmdb.schema.js'
import { extractTmdbId, extractTvdbId } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

const TMDB_API_TIMEOUT = 30_000

export class TmdbService {
  private static readonly BASE_URL = 'https://api.themoviedb.org/3'

  private static readonly RATE_LIMIT_PER_SECOND = 40

  private static readonly RATE_LIMIT_WINDOW_MS = 1000

  private requestQueue: Array<{
    execute: () => Promise<Response>
    resolve: (value: Response) => void
    reject: (reason: Error) => void
  }> = []

  private requestTimestamps: number[] = []

  private isProcessingQueue = false

  private providerCache = new Map<
    string,
    {
      providers: TmdbWatchProvider[]
      fetchedAt: number
    }
  >()

  private static readonly PROVIDER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'TMDB')
  }

  private get accessToken(): string {
    return this.fastify.config.tmdbApiKey
  }

  private get defaultRegion(): string {
    return this.fastify.config.tmdbRegion || 'US'
  }

  async getMovieMetadata(
    tmdbId: number,
    region?: string,
  ): Promise<TmdbMovieMetadata | null> {
    try {
      const movieRegion = region || this.defaultRegion

      const [
        detailsResponse,
        watchProvidersResponse,
        radarrRatingsResponse,
        plexRatingsResponse,
      ] = await Promise.allSettled([
        this.fetchMovieDetails(tmdbId),
        this.fetchMovieWatchProviders(tmdbId, movieRegion),
        this.fetchRadarrRatings(tmdbId),
        this.fetchPlexRatings(tmdbId),
      ])

      if (detailsResponse.status === 'rejected') {
        this.log.error(
          { error: detailsResponse.reason, tmdbId },
          'Failed to fetch movie details',
        )
        return null
      }

      const details = detailsResponse.value
      if (!details) {
        this.log.warn(`No movie details found for TMDB ID ${tmdbId}`)
        return null
      }

      let watchProviders: TmdbWatchProviderData | undefined
      if (
        watchProvidersResponse.status === 'fulfilled' &&
        watchProvidersResponse.value
      ) {
        // TMDB already filters by region, so fall back to the first region it returned
        const results = watchProvidersResponse.value.results
        watchProviders = results[movieRegion] || Object.values(results)[0]
      } else if (watchProvidersResponse.status === 'rejected') {
        this.log.warn(
          { error: watchProvidersResponse.reason, tmdbId },
          'Failed to fetch watch providers for movie',
        )
      }

      let radarrRatings: RadarrRatings | undefined
      if (
        radarrRatingsResponse.status === 'fulfilled' &&
        radarrRatingsResponse.value
      ) {
        radarrRatings = radarrRatingsResponse.value
      } else if (radarrRatingsResponse.status === 'rejected') {
        this.log.warn(
          { error: radarrRatingsResponse.reason, tmdbId },
          'Failed to fetch Radarr ratings for movie',
        )
      }

      let plexRatings: PlexRatings | undefined
      if (
        plexRatingsResponse.status === 'fulfilled' &&
        plexRatingsResponse.value
      ) {
        plexRatings = plexRatingsResponse.value
      } else if (plexRatingsResponse.status === 'rejected') {
        this.log.warn(
          { error: plexRatingsResponse.reason, tmdbId },
          'Failed to fetch Plex ratings for movie',
        )
      }

      return {
        details,
        watchProviders,
        radarrRatings,
        plexRatings,
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

      const [detailsResponse, watchProvidersResponse, plexRatingsResponse] =
        await Promise.allSettled([
          this.fetchTvDetails(tmdbId),
          this.fetchTvWatchProviders(tmdbId, tvRegion),
          this.fetchPlexRatings(tmdbId),
        ])

      if (detailsResponse.status === 'rejected') {
        this.log.error(
          { error: detailsResponse.reason, tmdbId },
          'Failed to fetch TV details',
        )
        return null
      }

      const details = detailsResponse.value
      if (!details) {
        this.log.warn(`No TV details found for TMDB ID ${tmdbId}`)
        return null
      }

      let watchProviders: TmdbWatchProviderData | undefined
      if (
        watchProvidersResponse.status === 'fulfilled' &&
        watchProvidersResponse.value
      ) {
        // TMDB already filters by region, so fall back to the first region it returned
        const results = watchProvidersResponse.value.results
        watchProviders = results[tvRegion] || Object.values(results)[0]
      } else if (watchProvidersResponse.status === 'rejected') {
        this.log.warn(
          { error: watchProvidersResponse.reason, tmdbId },
          'Failed to fetch watch providers for TV',
        )
      }

      let plexRatings: PlexRatings | undefined
      if (
        plexRatingsResponse.status === 'fulfilled' &&
        plexRatingsResponse.value
      ) {
        plexRatings = plexRatingsResponse.value
      } else if (plexRatingsResponse.status === 'rejected') {
        this.log.warn(
          { error: plexRatingsResponse.reason, tmdbId },
          'Failed to fetch Plex ratings for TV',
        )
      }

      return {
        details,
        watchProviders,
        plexRatings,
      }
    } catch (error) {
      this.log.error({ error, tmdbId }, 'Error fetching TV metadata')
      return null
    }
  }

  private async fetchMovieDetails(
    tmdbId: number,
  ): Promise<TmdbMovieDetails | null> {
    const url = `${TmdbService.BASE_URL}/movie/${tmdbId}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        this.log.debug(`Movie not found in TMDB: ${tmdbId}`)
        return null
      }
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()

    if (typeof data === 'object' && data !== null && isTmdbError(data)) {
      this.log.warn(
        { status_message: data.status_message },
        `TMDB API returned error for movie ${tmdbId}:`,
      )
      return null
    }

    return data as TmdbMovieDetails
  }

  private async fetchTvDetails(tmdbId: number): Promise<TmdbTvDetails | null> {
    const url = `${TmdbService.BASE_URL}/tv/${tmdbId}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        this.log.debug(`TV show not found in TMDB: ${tmdbId}`)
        return null
      }
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()

    if (typeof data === 'object' && data !== null && isTmdbError(data)) {
      this.log.warn(
        { status_message: data.status_message },
        `TMDB API returned error for TV show ${tmdbId}:`,
      )
      return null
    }

    return data as TmdbTvDetails
  }

  private async fetchMovieWatchProviders(
    tmdbId: number,
    region: string,
  ): Promise<TmdbWatchProvidersResponse | null> {
    const url = `${TmdbService.BASE_URL}/movie/${tmdbId}/watch/providers?watch_region=${region}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        this.log.debug(`Watch providers not found for movie TMDB ID: ${tmdbId}`)
        return null
      }
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()

    if (typeof data === 'object' && data !== null && isTmdbError(data)) {
      this.log.warn(
        { status_message: data.status_message },
        `TMDB API returned error for movie watch providers ${tmdbId}:`,
      )
      return null
    }

    return data as TmdbWatchProvidersResponse
  }

  private async fetchTvWatchProviders(
    tmdbId: number,
    region: string,
  ): Promise<TmdbWatchProvidersResponse | null> {
    const url = `${TmdbService.BASE_URL}/tv/${tmdbId}/watch/providers?watch_region=${region}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        this.log.debug(`Watch providers not found for TV TMDB ID: ${tmdbId}`)
        return null
      }
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()

    if (typeof data === 'object' && data !== null && isTmdbError(data)) {
      this.log.warn(
        { status_message: data.status_message },
        `TMDB API returned error for TV watch providers ${tmdbId}:`,
      )
      return null
    }

    return data as TmdbWatchProvidersResponse
  }

  async getAvailableRegions(): Promise<TmdbRegion[] | null> {
    if (!this.isConfigured()) {
      this.log.warn('TMDB is not configured, skipping region fetch')
      return null
    }

    try {
      const url = `${TmdbService.BASE_URL}/watch/providers/regions`
      const response = await this.rateLimitedFetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          this.log.debug('No regions found in TMDB')
          return null
        }
        throw new Error(
          `TMDB API error: ${response.status} ${response.statusText}`,
        )
      }

      const data = await response.json()

      if (typeof data === 'object' && data !== null && isTmdbError(data)) {
        this.log.warn(
          { status_message: data.status_message },
          'TMDB API returned error for regions:',
        )
        return null
      }

      if (
        typeof data === 'object' &&
        data !== null &&
        'results' in data &&
        Array.isArray(data.results)
      ) {
        return data.results.map(
          (region: { iso_3166_1: string; english_name: string }) => ({
            code: region.iso_3166_1,
            name: region.english_name,
          }),
        )
      }

      return null
    } catch (error) {
      this.log.error({ error }, 'Error fetching TMDB regions:')
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

    const url = `${TmdbService.BASE_URL}/find/${tvdbId}?external_source=tvdb_id`

    try {
      const response = await this.rateLimitedFetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          this.log.debug(`No content found in TMDB for TVDB ID: ${tvdbId}`)
          return null
        }
        throw new Error(
          `TMDB API error: ${response.status} ${response.statusText}`,
        )
      }

      const data = await response.json()

      if (typeof data === 'object' && data !== null && isTmdbError(data)) {
        this.log.warn(
          { status_message: data.status_message },
          `TMDB API returned error for TVDB ID ${tvdbId}:`,
        )
        return null
      }

      const findResponse = data as TmdbFindResponse

      if (findResponse.tv_results && findResponse.tv_results.length > 0) {
        return {
          tmdbId: findResponse.tv_results[0].id,
          type: 'tv',
        }
      }

      if (findResponse.movie_results && findResponse.movie_results.length > 0) {
        return {
          tmdbId: findResponse.movie_results[0].id,
          type: 'movie',
        }
      }

      this.log.debug(`No results found for TVDB ID ${tvdbId}`)
      return null
    } catch (error) {
      this.log.error({ error }, `Error finding content by TVDB ID ${tvdbId}:`)
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
          ? await this.fetchTvDetails(tmdbId)
          : await this.fetchMovieDetails(tmdbId)

      return details?.poster_path ?? null
    } catch (error) {
      this.log.debug(
        { error, tmdbId, type: resolvedType },
        'Failed to fetch poster path',
      )
      return null
    }
  }

  private async fetchRadarrRatings(
    tmdbId: number,
  ): Promise<RadarrRatings | null> {
    try {
      const radarrInstance = await this.fastify.db.getDefaultRadarrInstance()
      if (!radarrInstance) {
        this.log.debug('No default Radarr instance configured')
        return null
      }

      const radarrService = this.fastify.radarrManager.getRadarrService(
        radarrInstance.id,
      )
      if (!radarrService) {
        this.log.debug(
          `Radarr service not found for instance ${radarrInstance.id}`,
        )
        return null
      }

      const lookupResponse = await radarrService.getFromRadarr<
        RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
      >(`movie/lookup/tmdb?tmdbId=${tmdbId}`)

      const movieData = Array.isArray(lookupResponse)
        ? lookupResponse[0]
        : lookupResponse

      if (!movieData?.ratings) {
        this.log.debug(`No ratings found in Radarr for TMDB ID ${tmdbId}`)
        return null
      }

      return movieData.ratings
    } catch (error) {
      this.log.warn({ error, tmdbId }, 'Failed to fetch Radarr ratings')
      return null
    }
  }

  private async fetchPlexRatings(tmdbId: number): Promise<PlexRatings | null> {
    try {
      const tmdbGuid = `tmdb:${tmdbId}`
      const items = await this.fastify.db.getWatchlistItemsByGuid(tmdbGuid)

      if (items.length === 0) {
        this.log.debug(`No watchlist item found for TMDB ID ${tmdbId}`)
        return null
      }

      const ratings = items[0].ratings
      if (!ratings) {
        this.log.debug(`No Plex ratings stored for TMDB ID ${tmdbId}`)
        return null
      }

      return {
        imdb: ratings.imdb,
        rtCritic: ratings.rtCritic,
        rtAudience: ratings.rtAudience,
        tmdb: ratings.tmdb,
      }
    } catch (error) {
      this.log.warn({ error, tmdbId }, 'Failed to fetch Plex ratings from DB')
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
    if (
      cached &&
      Date.now() - cached.fetchedAt < TmdbService.PROVIDER_CACHE_TTL_MS
    ) {
      this.log.debug(`Using cached providers for region ${providerRegion}`)
      return cached.providers
    }

    this.log.debug(`Fetching providers for region ${providerRegion} from TMDB`)

    try {
      const [movieResponse, tvResponse] = await Promise.allSettled([
        this.fetchProviderList('movie', providerRegion),
        this.fetchProviderList('tv', providerRegion),
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

      if (movieResponse.status === 'fulfilled' && movieResponse.value) {
        for (const provider of movieResponse.value) {
          allProviders.set(provider.provider_id, provider)
        }
      }

      if (tvResponse.status === 'fulfilled' && tvResponse.value) {
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

  private async fetchProviderList(
    type: 'movie' | 'tv',
    region: string,
  ): Promise<TmdbWatchProvider[] | null> {
    const url = `${TmdbService.BASE_URL}/watch/providers/${type}?watch_region=${region}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        this.log.debug(`No ${type} providers found for region ${region}`)
        return null
      }
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()

    if (typeof data === 'object' && data !== null && isTmdbError(data)) {
      this.log.warn(
        { status_message: data.status_message },
        `TMDB API returned error for ${type} providers in ${region}:`,
      )
      return null
    }

    if (
      typeof data === 'object' &&
      data !== null &&
      'results' in data &&
      Array.isArray(data.results)
    ) {
      return data.results as TmdbWatchProvider[]
    }

    return []
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

    const url = `${TmdbService.BASE_URL}/${type}/${tmdbId}/watch/providers`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        this.log.debug(
          `No watch providers found for ${type} ${tmdbId} in region ${targetRegion}`,
        )
        return null
      }
      throw new Error(
        `TMDB API error: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()

    if (typeof data === 'object' && data !== null && isTmdbError(data)) {
      this.log.warn(
        { status_message: data.status_message },
        `TMDB API returned error for ${type} ${tmdbId} watch providers:`,
      )
      return null
    }

    if (
      typeof data === 'object' &&
      data !== null &&
      'results' in data &&
      typeof data.results === 'object' &&
      data.results !== null
    ) {
      const results = data.results as Record<
        string,
        TmdbWatchProviderData | undefined
      >
      const regionData = results[targetRegion]
      return regionData ?? null
    }

    return null
  }

  private async rateLimitedFetch(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        execute: () =>
          fetch(url, {
            ...options,
            signal: AbortSignal.timeout(TMDB_API_TIMEOUT),
          }),
        resolve,
        reject,
      })

      if (!this.isProcessingQueue) {
        void this.processRequestQueue()
      }
    })
  }

  private async processRequestQueue(): Promise<void> {
    this.isProcessingQueue = true

    while (this.requestQueue.length > 0) {
      const now = Date.now()

      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => now - timestamp < TmdbService.RATE_LIMIT_WINDOW_MS,
      )

      if (this.requestTimestamps.length >= TmdbService.RATE_LIMIT_PER_SECOND) {
        const oldestTimestamp = this.requestTimestamps[0]
        const waitTime =
          TmdbService.RATE_LIMIT_WINDOW_MS - (now - oldestTimestamp)

        this.log.debug(`Rate limit reached, waiting ${waitTime}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        continue
      }

      const request = this.requestQueue.shift()
      if (!request) continue

      try {
        const response = await this.executeWithRetry(request.execute)
        this.requestTimestamps.push(Date.now())
        request.resolve(response)
      } catch (error) {
        request.reject(error as Error)
      }
    }

    this.isProcessingQueue = false
  }

  private async executeWithRetry(
    executeRequest: () => Promise<Response>,
    retryCount429 = 0,
    retryCountNetwork = 0,
    maxRetries = 3,
  ): Promise<Response> {
    try {
      const response = await executeRequest()

      if (response.status === 429) {
        if (retryCount429 >= maxRetries) {
          throw new Error('TMDB rate limit exceeded, max retries reached')
        }

        // TMDB sends a retry-after header on 429, so honor it over the backoff
        const retryAfter = response.headers.get('retry-after')
        const baseWaitTime = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : 2 ** (retryCount429 + 1) * 1000

        const jitter = baseWaitTime * 0.1
        const waitTime = baseWaitTime + (Math.random() * 2 - 1) * jitter

        this.log.warn(
          `TMDB rate limit hit (429), retrying after ${Math.round(waitTime)}ms (attempt ${retryCount429 + 1}/${maxRetries})`,
        )

        await new Promise((resolve) => setTimeout(resolve, waitTime))
        return this.executeWithRetry(
          executeRequest,
          retryCount429 + 1,
          retryCountNetwork,
          maxRetries,
        )
      }

      return response
    } catch (error) {
      if (retryCountNetwork < maxRetries) {
        const baseWaitTime = 2 ** retryCountNetwork * 1000

        const jitter = baseWaitTime * 0.1
        const waitTime = baseWaitTime + (Math.random() * 2 - 1) * jitter

        this.log.warn(
          `TMDB request failed, retrying after ${Math.round(waitTime)}ms (attempt ${retryCountNetwork + 1}/${maxRetries})`,
        )
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        return this.executeWithRetry(
          executeRequest,
          retryCount429,
          retryCountNetwork + 1,
          maxRetries,
        )
      }
      throw error
    }
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.accessToken.trim() !== '')
  }
}
