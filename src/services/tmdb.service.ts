/**
 * TMDB Service
 *
 * Service for interacting with The Movie Database (TMDB) API v3 to fetch
 * movie and TV show metadata including overview, ratings, and watch providers.
 * Uses modern Bearer token authentication (API Read Access Token).
 */

import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type {
  TmdbFindResponse,
  TmdbWatchProvider,
  TmdbWatchProviderData,
  TmdbWatchProvidersResponse,
} from '@root/types/tmdb.types.js'
import { isTmdbError } from '@root/types/tmdb.types.js'
import type {
  RadarrRatings,
  TmdbMovieDetails,
  TmdbMovieMetadata,
  TmdbRegion,
  TmdbTvDetails,
  TmdbTvMetadata,
} from '@schemas/tmdb/tmdb.schema.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class TmdbService {
  private static readonly BASE_URL = 'https://api.themoviedb.org/3'
  private static readonly USER_AGENT =
    'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'

  //
  // ============================================================
  // RATE LIMITING CONFIGURATION
  // ============================================================
  //

  /** Rate limit: 40 requests per second (TMDB official guidance) */
  private static readonly RATE_LIMIT_PER_SECOND = 40

  /** Rate limit time window in milliseconds */
  private static readonly RATE_LIMIT_WINDOW_MS = 1000

  /** Queue of pending requests waiting for rate limit slots */
  private requestQueue: Array<{
    execute: () => Promise<Response>
    resolve: (value: Response) => void
    reject: (reason: Error) => void
  }> = []

  /** Timestamps of recent requests (for token bucket algorithm) */
  private requestTimestamps: number[] = []

  /** Whether the queue processor is currently running */
  private isProcessingQueue = false

  //
  // ============================================================
  // PROVIDER CACHE CONFIGURATION
  // ============================================================
  //

  /** Provider cache: region → providers list with timestamp */
  private providerCache = new Map<
    string,
    {
      providers: TmdbWatchProvider[]
      fetchedAt: number
    }
  >()

  /** Provider cache TTL: 24 hours */
  private static readonly PROVIDER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

  //
  // ============================================================
  // SERVICE INITIALIZATION
  // ============================================================
  //

  /** Creates a fresh service logger that inherits current log level */
  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'TMDB')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  /**
   * Get current TMDB API Read Access Token from config
   */
  private get accessToken(): string {
    return this.fastify.config.tmdbApiKey
  }

  /**
   * Get current TMDB region from database config
   */
  private get defaultRegion(): string {
    return this.fastify.config.tmdbRegion || 'US'
  }

  /**
   * Fetch movie metadata including details and watch providers
   */
  async getMovieMetadata(
    tmdbId: number,
    region?: string,
  ): Promise<TmdbMovieMetadata | null> {
    try {
      const movieRegion = region || this.defaultRegion

      // Fetch movie details, watch providers, and radarr ratings in parallel
      const [detailsResponse, watchProvidersResponse, radarrRatingsResponse] =
        await Promise.allSettled([
          this.fetchMovieDetails(tmdbId),
          this.fetchMovieWatchProviders(tmdbId, movieRegion),
          this.fetchRadarrRatings(tmdbId),
        ])

      // Check if details fetch failed
      if (detailsResponse.status === 'rejected') {
        this.log.error(
          `Failed to fetch movie details for TMDB ID ${tmdbId}:`,
          detailsResponse.reason,
        )
        return null
      }

      const details = detailsResponse.value
      if (!details) {
        this.log.warn(`No movie details found for TMDB ID ${tmdbId}`)
        return null
      }

      // Watch providers are optional, so we continue even if they fail
      let watchProviders: TmdbWatchProviderData | undefined
      if (
        watchProvidersResponse.status === 'fulfilled' &&
        watchProvidersResponse.value
      ) {
        // API filters by region, get the requested region or fallback to any available region
        const results = watchProvidersResponse.value.results
        watchProviders = results[movieRegion] || Object.values(results)[0]
      } else if (watchProvidersResponse.status === 'rejected') {
        this.log.warn(
          `Failed to fetch watch providers for movie TMDB ID ${tmdbId}:`,
          watchProvidersResponse.reason,
        )
      }

      // Radarr ratings are optional, so we continue even if they fail
      let radarrRatings: RadarrRatings | undefined
      if (
        radarrRatingsResponse.status === 'fulfilled' &&
        radarrRatingsResponse.value
      ) {
        radarrRatings = radarrRatingsResponse.value
      } else if (radarrRatingsResponse.status === 'rejected') {
        this.log.warn(
          `Failed to fetch Radarr ratings for movie TMDB ID ${tmdbId}:`,
          radarrRatingsResponse.reason,
        )
      }

      return {
        details,
        watchProviders,
        radarrRatings,
      }
    } catch (error) {
      this.log.error({ error, tmdbId }, 'Error fetching movie metadata')
      return null
    }
  }

  /**
   * Fetch TV show metadata including details and watch providers
   */
  async getTvMetadata(
    tmdbId: number,
    region?: string,
  ): Promise<TmdbTvMetadata | null> {
    try {
      const tvRegion = region || this.defaultRegion

      // Fetch TV details and watch providers in parallel
      const [detailsResponse, watchProvidersResponse] =
        await Promise.allSettled([
          this.fetchTvDetails(tmdbId),
          this.fetchTvWatchProviders(tmdbId, tvRegion),
        ])

      // Check if details fetch failed
      if (detailsResponse.status === 'rejected') {
        this.log.error(
          `Failed to fetch TV details for TMDB ID ${tmdbId}:`,
          detailsResponse.reason,
        )
        return null
      }

      const details = detailsResponse.value
      if (!details) {
        this.log.warn(`No TV details found for TMDB ID ${tmdbId}`)
        return null
      }

      // Watch providers are optional, so we continue even if they fail
      let watchProviders: TmdbWatchProviderData | undefined
      if (
        watchProvidersResponse.status === 'fulfilled' &&
        watchProvidersResponse.value
      ) {
        // API filters by region, get the requested region or fallback to any available region
        const results = watchProvidersResponse.value.results
        watchProviders = results[tvRegion] || Object.values(results)[0]
      } else if (watchProvidersResponse.status === 'rejected') {
        this.log.warn(
          `Failed to fetch watch providers for TV TMDB ID ${tmdbId}:`,
          watchProvidersResponse.reason,
        )
      }

      return {
        details,
        watchProviders,
      }
    } catch (error) {
      this.log.error({ error, tmdbId }, 'Error fetching TV metadata')
      return null
    }
  }

  /**
   * Fetch movie details from TMDB
   */
  private async fetchMovieDetails(
    tmdbId: number,
  ): Promise<TmdbMovieDetails | null> {
    const url = `${TmdbService.BASE_URL}/movie/${tmdbId}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': TmdbService.USER_AGENT,
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

  /**
   * Fetch TV show details from TMDB
   */
  private async fetchTvDetails(tmdbId: number): Promise<TmdbTvDetails | null> {
    const url = `${TmdbService.BASE_URL}/tv/${tmdbId}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': TmdbService.USER_AGENT,
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

  /**
   * Fetch watch providers for a movie
   */
  private async fetchMovieWatchProviders(
    tmdbId: number,
    region: string,
  ): Promise<TmdbWatchProvidersResponse | null> {
    const url = `${TmdbService.BASE_URL}/movie/${tmdbId}/watch/providers?watch_region=${region}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': TmdbService.USER_AGENT,
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

  /**
   * Fetch watch providers for a TV show
   */
  private async fetchTvWatchProviders(
    tmdbId: number,
    region: string,
  ): Promise<TmdbWatchProvidersResponse | null> {
    const url = `${TmdbService.BASE_URL}/tv/${tmdbId}/watch/providers?watch_region=${region}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': TmdbService.USER_AGENT,
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

  /**
   * Get available regions for watch providers from TMDB
   * Returns regions that have streaming/OTT data available
   */
  async getAvailableRegions(): Promise<TmdbRegion[] | null> {
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

      // Transform TMDB response to our format
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

  /**
   * Find content by TVDB ID using TMDB's find endpoint
   * Returns both the TMDB ID and content type (movie or tv)
   */
  async findByTvdbId(
    tvdbId: number,
  ): Promise<{ tmdbId: number; type: 'movie' | 'tv' } | null> {
    const url = `${TmdbService.BASE_URL}/find/${tvdbId}?external_source=tvdb_id`

    try {
      const response = await this.rateLimitedFetch(url, {
        headers: {
          'User-Agent': TmdbService.USER_AGENT,
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

      // Check TV results first (more likely for TVDB)
      if (findResponse.tv_results && findResponse.tv_results.length > 0) {
        return {
          tmdbId: findResponse.tv_results[0].id,
          type: 'tv',
        }
      }

      // Check movie results
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

  /**
   * Fetch Radarr ratings for a movie by TMDB ID
   * Returns null if no Radarr instance available or movie not found
   */
  private async fetchRadarrRatings(
    tmdbId: number,
  ): Promise<RadarrRatings | null> {
    try {
      // Get default Radarr instance
      const radarrInstance = await this.fastify.db.getDefaultRadarrInstance()
      if (!radarrInstance) {
        this.log.debug('No default Radarr instance configured')
        return null
      }

      // Get Radarr service for the instance
      const radarrService = this.fastify.radarrManager.getRadarrService(
        radarrInstance.id,
      )
      if (!radarrService) {
        this.log.debug(
          `Radarr service not found for instance ${radarrInstance.id}`,
        )
        return null
      }

      // Lookup movie by TMDB ID to get ratings
      const lookupResponse = await radarrService.getFromRadarr<
        RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
      >(`movie/lookup/tmdb?tmdbId=${tmdbId}`)

      // Handle array or single response
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

  //
  // ============================================================
  // PROVIDER LIST METHODS
  // ============================================================
  //

  /**
   * Get list of all streaming providers available for a region
   * Results are cached for 24 hours to minimize API calls
   *
   * @param region - 2-letter region code (e.g., "US", "GB")
   * @returns Array of watch providers with IDs, names, and logos
   */
  async getAvailableProviders(
    region?: string,
  ): Promise<TmdbWatchProvider[] | null> {
    const providerRegion = region || this.defaultRegion

    // Check cache first
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
      // Fetch providers for both movies and TV in parallel
      const [movieResponse, tvResponse] = await Promise.allSettled([
        this.fetchProviderList('movie', providerRegion),
        this.fetchProviderList('tv', providerRegion),
      ])

      // Collect providers from both responses
      const allProviders = new Map<number, TmdbWatchProvider>()

      // Add movie providers
      if (movieResponse.status === 'fulfilled' && movieResponse.value) {
        for (const provider of movieResponse.value) {
          allProviders.set(provider.provider_id, provider)
        }
      }

      // Add TV providers (merge with movies, deduplicate by ID)
      if (tvResponse.status === 'fulfilled' && tvResponse.value) {
        for (const provider of tvResponse.value) {
          if (!allProviders.has(provider.provider_id)) {
            allProviders.set(provider.provider_id, provider)
          }
        }
      }

      // Convert to sorted array
      const providers = Array.from(allProviders.values()).sort(
        (a, b) => a.display_priority - b.display_priority,
      )

      // Cache the result
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

  /**
   * Fetch provider list from TMDB for a specific content type and region
   *
   * @param type - Content type (movie or tv)
   * @param region - 2-letter region code
   * @returns Array of providers or null
   */
  private async fetchProviderList(
    type: 'movie' | 'tv',
    region: string,
  ): Promise<TmdbWatchProvider[] | null> {
    const url = `${TmdbService.BASE_URL}/watch/providers/${type}?watch_region=${region}`

    const response = await this.rateLimitedFetch(url, {
      headers: {
        'User-Agent': TmdbService.USER_AGENT,
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

    // TMDB returns: { results: TmdbWatchProvider[] }
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

  /**
   * Clear provider cache (useful for testing or manual refresh)
   *
   * @param region - Optional specific region to clear, otherwise clears all
   */
  clearProviderCache(region?: string): void {
    if (region) {
      this.providerCache.delete(region)
      this.log.debug(`Cleared provider cache for region ${region}`)
    } else {
      this.providerCache.clear()
      this.log.debug('Cleared all provider cache')
    }
  }

  /**
   * Get watch provider availability for a specific movie or TV show
   *
   * @param tmdbId - TMDB ID for the movie or show
   * @param type - Content type ('movie' or 'tv')
   * @param region - Optional region code (defaults to configured region)
   * @returns Watch provider data for the content or null if not found
   */
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
        'User-Agent': TmdbService.USER_AGENT,
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

    // TMDB returns: { results: { [region]: { ... } } }
    if (
      typeof data === 'object' &&
      data !== null &&
      'results' in data &&
      typeof data.results === 'object' &&
      data.results !== null
    ) {
      const results = data.results as Record<string, unknown>
      // Return the providers for the target region
      return results[targetRegion] || null
    }

    return null
  }

  //
  // ============================================================
  // RATE LIMITING METHODS
  // ============================================================
  //

  /**
   * Rate-limited fetch wrapper for TMDB API calls
   *
   * Implements token bucket algorithm to respect TMDB's ~40 req/s rate limit.
   * Handles 429 responses with exponential backoff retry logic.
   *
   * @param url - Full URL to fetch
   * @param options - Fetch options
   * @returns Promise resolving to Response
   */
  private async rateLimitedFetch(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        execute: () => fetch(url, options),
        resolve,
        reject,
      })

      // Start processing queue if not already running
      if (!this.isProcessingQueue) {
        void this.processRequestQueue()
      }
    })
  }

  /**
   * Process queued requests respecting rate limits (token bucket algorithm)
   */
  private async processRequestQueue(): Promise<void> {
    this.isProcessingQueue = true

    while (this.requestQueue.length > 0) {
      const now = Date.now()

      // Remove timestamps outside the current window
      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => now - timestamp < TmdbService.RATE_LIMIT_WINDOW_MS,
      )

      // Check if we can make a request
      if (this.requestTimestamps.length >= TmdbService.RATE_LIMIT_PER_SECOND) {
        // Wait until we can make another request
        const oldestTimestamp = this.requestTimestamps[0]
        const waitTime =
          TmdbService.RATE_LIMIT_WINDOW_MS - (now - oldestTimestamp)

        this.log.debug(`Rate limit reached, waiting ${waitTime}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        continue
      }

      // Dequeue and execute request
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

  /**
   * Execute request with separate retry logic for rate limits vs network errors
   *
   * @param executeRequest - Function that executes the fetch request
   * @param retryCount429 - Current retry attempt for 429 rate limits
   * @param retryCountNetwork - Current retry attempt for network/generic errors
   * @param maxRetries - Maximum number of retries for each error type
   * @returns Promise resolving to Response
   */
  private async executeWithRetry(
    executeRequest: () => Promise<Response>,
    retryCount429 = 0,
    retryCountNetwork = 0,
    maxRetries = 3,
  ): Promise<Response> {
    try {
      const response = await executeRequest()

      // Handle 429 Too Many Requests
      if (response.status === 429) {
        if (retryCount429 >= maxRetries) {
          throw new Error('TMDB rate limit exceeded, max retries reached')
        }

        // Get retry-after header or use exponential backoff
        const retryAfter = response.headers.get('retry-after')
        const baseWaitTime = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : 2 ** retryCount429 * 1000 // Exponential backoff: 1s, 2s, 4s

        // Add ±10% jitter to prevent synchronized retries
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

        // Add ±10% jitter to prevent synchronized retries
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

  //
  // ============================================================
  // UTILITY METHODS
  // ============================================================
  //

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.accessToken && this.accessToken.trim() !== '')
  }
}
