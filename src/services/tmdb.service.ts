/**
 * TMDB Service
 *
 * Service for interacting with The Movie Database (TMDB) API v3 to fetch
 * movie and TV show metadata including overview, ratings, and watch providers.
 * Uses modern Bearer token authentication (API Read Access Token).
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
  TmdbMovieMetadata,
  TmdbTvMetadata,
  RadarrRatings,
  TmdbRegion,
} from '@schemas/tmdb/tmdb.schema.js'
import type {
  TmdbErrorResponse,
  TmdbWatchProvidersResponse,
  TmdbFindResponse,
  TmdbWatchProviderData,
} from '@root/types/tmdb.types.js'
import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import { isTmdbError } from '@root/types/tmdb.types.js'

export class TmdbService {
  private static readonly BASE_URL = 'https://api.themoviedb.org/3'
  private static readonly USER_AGENT =
    'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'

  constructor(
    private readonly log: FastifyBaseLogger,
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
      this.log.error(
        `Error fetching movie metadata for TMDB ID ${tmdbId}:`,
        error,
      )
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
      this.log.error(
        { error },
        `Error fetching TV metadata for TMDB ID ${tmdbId}:`,
      )
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': TmdbService.USER_AGENT,
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

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
          `TMDB API returned error for movie ${tmdbId}:`,
          data.status_message,
        )
        return null
      }

      return data as TmdbMovieDetails
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Fetch TV show details from TMDB
   */
  private async fetchTvDetails(tmdbId: number): Promise<TmdbTvDetails | null> {
    const url = `${TmdbService.BASE_URL}/tv/${tmdbId}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': TmdbService.USER_AGENT,
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

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
          `TMDB API returned error for TV show ${tmdbId}:`,
          data.status_message,
        )
        return null
      }

      return data as TmdbTvDetails
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Fetch watch providers for a movie
   */
  private async fetchMovieWatchProviders(
    tmdbId: number,
    region: string,
  ): Promise<TmdbWatchProvidersResponse | null> {
    const url = `${TmdbService.BASE_URL}/movie/${tmdbId}/watch/providers?watch_region=${region}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': TmdbService.USER_AGENT,
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 404) {
          this.log.debug(
            `Watch providers not found for movie TMDB ID: ${tmdbId}`,
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
          `TMDB API returned error for movie watch providers ${tmdbId}:`,
          data.status_message,
        )
        return null
      }

      return data as TmdbWatchProvidersResponse
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Fetch watch providers for a TV show
   */
  private async fetchTvWatchProviders(
    tmdbId: number,
    region: string,
  ): Promise<TmdbWatchProvidersResponse | null> {
    const url = `${TmdbService.BASE_URL}/tv/${tmdbId}/watch/providers?watch_region=${region}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': TmdbService.USER_AGENT,
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

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
          `TMDB API returned error for TV watch providers ${tmdbId}:`,
          data.status_message,
        )
        return null
      }

      return data as TmdbWatchProvidersResponse
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Get available regions for watch providers from TMDB
   * Returns regions that have streaming/OTT data available
   */
  async getAvailableRegions(): Promise<TmdbRegion[] | null> {
    try {
      const url = `${TmdbService.BASE_URL}/watch/providers/regions`
      const response = await fetch(url, {
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
          'TMDB API returned error for regions:',
          data.status_message,
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': TmdbService.USER_AGENT,
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

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
          `TMDB API returned error for TVDB ID ${tvdbId}:`,
          data.status_message,
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
      clearTimeout(timeoutId)
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
      this.log.warn(
        `Failed to fetch Radarr ratings for TMDB ID ${tmdbId}:`,
        error,
      )
      return null
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.accessToken && this.accessToken.trim() !== '')
  }
}
