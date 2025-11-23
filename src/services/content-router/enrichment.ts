/**
 * Content Enrichment Helpers
 *
 * Helper functions for enriching content items with external metadata
 * from Radarr, Sonarr, IMDB, TMDB, and anime detection services.
 */

import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'
import type { ContentItem, RoutingContext } from '@root/types/router.types.js'
import type { TmdbWatchProviderData } from '@root/types/tmdb.types.js'
import {
  extractImdbId,
  extractTmdbId,
  extractTvdbId,
  parseGenres,
} from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * Determines which types of enrichment are needed based on active router rules.
 * This optimization avoids unnecessary API calls by only fetching data that
 * active evaluators actually require.
 *
 * @param allRules - All router rules (should be cached by caller)
 * @param contentType - Type of content ('movie' or 'show')
 * @returns Object indicating which enrichment types are needed
 */
export function determineEnrichmentNeeds(
  allRules: Awaited<ReturnType<FastifyInstance['db']['getAllRouterRules']>>,
  _contentType: 'movie' | 'show',
): {
  needsMetadata: boolean
  needsImdb: boolean
  needsProviders: boolean
  needsAnimeCheck: boolean
} {
  try {
    // Filter to enabled rules only
    const enabledRules = allRules.filter((rule) => rule.enabled !== false)

    if (enabledRules.length === 0) {
      return {
        needsMetadata: false,
        needsImdb: false,
        needsProviders: false,
        needsAnimeCheck: false,
      }
    }

    // All rules are stored as 'conditional' type, so we need to check the criteria
    // to determine what enrichment data is needed
    let needsMetadata = false
    let needsImdb = false
    let needsProviders = false
    let needsAnimeCheck = false

    for (const rule of enabledRules) {
      if (rule.type === 'conditional' && rule.criteria) {
        const criteriaString = JSON.stringify(rule.criteria)
        const criteriaLower = criteriaString.toLowerCase()

        // Check for fields that require metadata enrichment
        if (
          criteriaString.includes('certification') ||
          criteriaString.includes('language') ||
          criteriaString.includes('season') ||
          criteriaString.includes('year')
        ) {
          needsMetadata = true
        }

        // Check for IMDB fields (rating or votes)
        if (
          criteriaString.includes('imdbRating') ||
          criteriaString.includes('imdbVotes')
        ) {
          needsImdb = true
        }

        // Check for streaming services field
        if (criteriaString.includes('streamingServices')) {
          needsProviders = true
        }

        // Check for anime genre
        if (criteriaLower.includes('anime')) {
          needsAnimeCheck = true
        }

        // Short-circuit if we've found all needs
        if (needsMetadata && needsImdb && needsProviders && needsAnimeCheck) {
          break
        }
      }
    }

    return {
      needsMetadata,
      needsImdb,
      needsProviders,
      needsAnimeCheck,
    }
  } catch (_error) {
    // On error, be conservative and fetch everything
    return {
      needsMetadata: true,
      needsImdb: true,
      needsProviders: true,
      needsAnimeCheck: true,
    }
  }
}

/**
 * Enriches a content item with additional metadata by making API calls to Radarr/Sonarr.
 * This is used to provide evaluators with more information for making routing decisions.
 * The enrichment happens once per routing operation to avoid duplicate API calls.
 *
 * @param fastify - Fastify instance for accessing services
 * @param log - Logger instance
 * @param allRules - All router rules (should be cached by caller)
 * @param item - The content item to enrich
 * @param context - Routing context with content type and other info
 * @returns Promise with the enriched content item
 */
export async function enrichItemMetadata(
  fastify: FastifyInstance,
  log: FastifyBaseLogger,
  allRules: Awaited<ReturnType<FastifyInstance['db']['getAllRouterRules']>>,
  item: ContentItem,
  context: RoutingContext,
): Promise<ContentItem> {
  const isMovie = context.contentType === 'movie'

  // Skip if we can't extract an ID from the item
  if (!Array.isArray(item.guids) || item.guids.length === 0) {
    return item
  }

  // Determine which enrichment types are actually needed
  const enrichmentNeeds = determineEnrichmentNeeds(
    allRules,
    context.contentType,
  )

  // Skip all enrichment if nothing is needed
  if (
    !enrichmentNeeds.needsMetadata &&
    !enrichmentNeeds.needsImdb &&
    !enrichmentNeeds.needsProviders &&
    !enrichmentNeeds.needsAnimeCheck
  ) {
    log.debug(
      `No enrichment needed for "${item.title}" (no matching rule types)`,
    )
    return item
  }

  // Extract appropriate ID based on content type (tmdb for movies, tvdb for shows)
  let itemId: number | undefined

  if (isMovie) {
    itemId = extractTmdbId(item.guids)
  } else {
    itemId = extractTvdbId(item.guids)
  }

  // Determine if we can fetch metadata - only skip metadata enrichment if we can't get the ID
  // Other enrichment types (IMDB, providers, anime) can still run as they extract IDs independently
  const canFetchMetadata =
    enrichmentNeeds.needsMetadata && itemId && !Number.isNaN(itemId)

  if (enrichmentNeeds.needsMetadata && !canFetchMetadata) {
    log.debug(
      `Couldn't extract ${isMovie ? 'TMDB' : 'TVDB'} ID from item "${item.title}", skipping metadata enrichment only`,
    )
  }

  try {
    // Fetch metadata from appropriate API based on content type
    if (isMovie) {
      // Variables to accumulate enrichment data
      let movieMetadata: RadarrMovieLookupResponse | undefined
      let imdbData:
        | { rating?: number | null; votes?: number | null }
        | undefined
      let watchProviders: TmdbWatchProviderData | undefined
      let enrichedGenres: string[] | undefined

      // 1. Fetch Radarr metadata if needed (for certification, language, year rules)
      if (canFetchMetadata) {
        try {
          const defaultInstance = await fastify.db.getDefaultRadarrInstance()
          if (!defaultInstance) {
            log.warn('No default Radarr instance available for metadata lookup')
          } else {
            const lookupService = fastify.radarrManager.getRadarrService(
              defaultInstance.id,
            )

            if (lookupService) {
              log.debug(
                `Calling Radarr API for "${item.title}" with TMDB ID: ${itemId}`,
              )
              const apiResponse = await lookupService.getFromRadarr<
                RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
              >(`movie/lookup/tmdb?tmdbId=${itemId}`)

              // Handle both array and single object responses
              if (Array.isArray(apiResponse) && apiResponse.length > 0) {
                movieMetadata = apiResponse[0]
              } else if (!Array.isArray(apiResponse)) {
                movieMetadata = apiResponse
              }

              if (movieMetadata) {
                log.debug(`Radarr metadata fetched for "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.error(
            { error },
            `Failed to fetch Radarr metadata for "${item.title}"`,
          )
        }
      }

      // 2. Fetch IMDB rating if needed (for imdb rules)
      if (enrichmentNeeds.needsImdb && fastify.imdb) {
        try {
          let imdbId = extractImdbId(item.guids)?.toString()
          if ((!imdbId || imdbId === '0') && movieMetadata?.imdbId) {
            imdbId = movieMetadata.imdbId.replace(/^tt/, '')
          }

          if (imdbId && imdbId !== '0') {
            const imdbRating = await fastify.imdb.getRating(item.guids)
            if (imdbRating) {
              imdbData = {
                rating: imdbRating.rating,
                votes: imdbRating.votes,
              }
              log.debug(
                `IMDB rating fetched for "${item.title}": ${imdbRating.rating}`,
              )
            } else {
              imdbData = {
                rating: null,
                votes: null,
              }
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to fetch IMDB rating for "${item.title}"`,
          )
        }
      }

      // 3. Fetch TMDB watch providers if needed (for streaming rules)
      if (enrichmentNeeds.needsProviders && fastify.tmdb) {
        try {
          const tmdbId = extractTmdbId(item.guids)
          if (tmdbId) {
            const providers = await fastify.tmdb.getWatchProviders(
              tmdbId,
              'movie',
            )
            if (providers) {
              watchProviders = providers
              log.debug(`TMDB watch providers fetched for "${item.title}"`)
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to fetch TMDB watch providers for "${item.title}"`,
          )
        }
      }

      // 4. Check anime status if needed (for conditional genre checks)
      if (enrichmentNeeds.needsAnimeCheck && fastify.anime) {
        try {
          const tvdbIdNum = extractTvdbId(item.guids)
          const tmdbIdNum = extractTmdbId(item.guids)
          const imdbIdNum = extractImdbId(item.guids)

          const tvdbId =
            tvdbIdNum && tvdbIdNum > 0 ? tvdbIdNum.toString() : undefined
          const tmdbId =
            tmdbIdNum && tmdbIdNum > 0 ? tmdbIdNum.toString() : undefined
          const imdbId =
            imdbIdNum && imdbIdNum > 0 ? imdbIdNum.toString() : undefined

          if (tvdbId || tmdbId || imdbId) {
            const isAnimeContent = await fastify.anime.isAnime(
              tvdbId,
              tmdbId,
              imdbId,
            )

            if (isAnimeContent) {
              const existingGenres = parseGenres(item.genres)
              const genresLowercase = existingGenres.map((g) => g.toLowerCase())

              if (!genresLowercase.includes('anime')) {
                enrichedGenres = [...existingGenres, 'anime']
                log.debug(`Anime genre added to "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to check anime status for "${item.title}"`,
          )
        }
      }

      // Return enriched item with all fetched data
      return {
        ...item,
        ...(movieMetadata && { metadata: movieMetadata }),
        ...(imdbData && { imdb: imdbData }),
        ...(watchProviders && { watchProviders }),
        ...(enrichedGenres && { genres: enrichedGenres }),
      }
    } else {
      // TV Shows - Variables to accumulate enrichment data
      let seriesMetadata: SonarrSeriesLookupResponse | undefined
      let imdbData:
        | { rating?: number | null; votes?: number | null }
        | undefined
      let watchProviders: TmdbWatchProviderData | undefined
      let enrichedGenres: string[] | undefined

      // 1. Fetch Sonarr metadata if needed (for certification, language, season, year rules)
      if (canFetchMetadata) {
        try {
          const defaultInstance = await fastify.db.getDefaultSonarrInstance()
          if (!defaultInstance) {
            log.warn('No default Sonarr instance available for metadata lookup')
          } else {
            const lookupService = fastify.sonarrManager.getSonarrService(
              defaultInstance.id,
            )

            if (lookupService) {
              log.debug(
                `Calling Sonarr API for "${item.title}" with TVDB ID: ${itemId}`,
              )
              const apiResponse = await lookupService.getFromSonarr<
                SonarrSeriesLookupResponse | SonarrSeriesLookupResponse[]
              >(`series/lookup?term=tvdb:${itemId}`)

              // Handle both array and single object responses
              if (Array.isArray(apiResponse) && apiResponse.length > 0) {
                seriesMetadata = apiResponse[0]
              } else if (!Array.isArray(apiResponse)) {
                seriesMetadata = apiResponse
              }

              if (seriesMetadata) {
                log.debug(`Sonarr metadata fetched for "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.error(
            { error },
            `Failed to fetch Sonarr metadata for "${item.title}"`,
          )
        }
      }

      // 2. Fetch IMDB rating if needed (for imdb rules)
      if (enrichmentNeeds.needsImdb && fastify.imdb) {
        try {
          const imdbRating = await fastify.imdb.getRating(item.guids)
          if (imdbRating) {
            imdbData = {
              rating: imdbRating.rating,
              votes: imdbRating.votes,
            }
            log.debug(
              `IMDB rating fetched for TV show "${item.title}": ${imdbRating.rating}`,
            )
          } else {
            imdbData = {
              rating: null,
              votes: null,
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to fetch IMDB rating for TV show "${item.title}"`,
          )
        }
      }

      // 3. Fetch TMDB watch providers if needed (for streaming rules)
      if (enrichmentNeeds.needsProviders && fastify.tmdb) {
        try {
          const tmdbId = extractTmdbId(item.guids)
          if (tmdbId) {
            const providers = await fastify.tmdb.getWatchProviders(tmdbId, 'tv')
            if (providers) {
              watchProviders = providers
              log.debug(
                `TMDB watch providers fetched for TV show "${item.title}"`,
              )
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to fetch TMDB watch providers for TV show "${item.title}"`,
          )
        }
      }

      // 4. Check anime status if needed (for conditional genre checks)
      if (enrichmentNeeds.needsAnimeCheck && fastify.anime) {
        try {
          const tvdbIdNum = extractTvdbId(item.guids)
          const tmdbIdNum = extractTmdbId(item.guids)
          const imdbIdNum = extractImdbId(item.guids)

          const tvdbId =
            tvdbIdNum && tvdbIdNum > 0 ? tvdbIdNum.toString() : undefined
          const tmdbId =
            tmdbIdNum && tmdbIdNum > 0 ? tmdbIdNum.toString() : undefined
          const imdbId =
            imdbIdNum && imdbIdNum > 0 ? imdbIdNum.toString() : undefined

          if (tvdbId || tmdbId || imdbId) {
            const isAnimeContent = await fastify.anime.isAnime(
              tvdbId,
              tmdbId,
              imdbId,
            )

            if (isAnimeContent) {
              const existingGenres = parseGenres(item.genres)
              const genresLowercase = existingGenres.map((g) => g.toLowerCase())

              if (!genresLowercase.includes('anime')) {
                enrichedGenres = [...existingGenres, 'anime']
                log.debug(`Anime genre added to TV show "${item.title}"`)
              }
            }
          }
        } catch (error) {
          log.debug(
            { error },
            `Failed to check anime status for TV show "${item.title}"`,
          )
        }
      }

      // Return enriched item with all fetched data
      return {
        ...item,
        ...(seriesMetadata && { metadata: seriesMetadata }),
        ...(imdbData && { imdb: imdbData }),
        ...(watchProviders && { watchProviders }),
        ...(enrichedGenres && { genres: enrichedGenres }),
      }
    }
  } catch (error) {
    log.error({ error }, `Error enriching metadata for "${item.title}"`)
  }

  // Return original item if enrichment failed
  return item
}
