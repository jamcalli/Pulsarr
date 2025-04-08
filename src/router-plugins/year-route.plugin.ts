import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
  CriteriaValue,
} from '@root/types/router.types.js'
import {
  type RadarrMovieLookupResponse,
  type SonarrSeriesLookupResponse,
  extractYear,
} from '@root/types/content-lookup.types.js'

/**
 * Determines whether a given year satisfies the specified criteria.
 *
 * The criteria can be one of the following:
 * - A single number, where the year must exactly match.
 * - An array of numbers, where the year must be one of the provided values.
 * - An object with optional `min` and `max` properties, where the year must be within the inclusive range.
 *
 * Returns false if the criteria are not in a recognized format.
 *
 * @param year - The year to evaluate.
 * @param criteria - The criteria to compare against, either as a number, number array, or an object with range boundaries.
 * @returns True if the year meets the criteria, false otherwise.
 */
function processYearCriteria(year: number, criteria: CriteriaValue): boolean {
  // Handle single number
  if (typeof criteria === 'number') {
    return year === criteria
  }

  // Handle array of numbers
  if (
    Array.isArray(criteria) &&
    criteria.every((item) => typeof item === 'number')
  ) {
    // Type assertion to help TypeScript understand this is a number array
    return (criteria as number[]).includes(year)
  }

  // Handle object criteria
  if (criteria && typeof criteria === 'object') {
    // Explicitly check if it's a plain object with number properties
    const isValidYearObject = (
      obj: unknown,
    ): obj is { min?: number; max?: number } =>
      typeof obj === 'object' &&
      obj !== null &&
      Object.keys(obj).every((key) => ['min', 'max'].includes(key)) &&
      (!('min' in obj) || typeof (obj as { min?: unknown }).min === 'number') &&
      (!('max' in obj) || typeof (obj as { max?: unknown }).max === 'number')

    if (isValidYearObject(criteria)) {
      const min = criteria.min ?? Number.NEGATIVE_INFINITY
      const max = criteria.max ?? Number.POSITIVE_INFINITY
      return year >= min && year <= max
    }
  }

  return false
}

/**
 * Creates a Fastify plugin for routing content based on release year.
 *
 * The plugin defines an asynchronous evaluation method that:
 * - Retrieves year-based routing rules from the database.
 * - Determines the content type (movie or TV show) and extracts the corresponding ID from
 *   the content item's GUIDs.
 * - Looks up the release year using the appropriate external service (Radarr for movies, Sonarr for TV shows).
 * - Filters rules based on the release year and converts matching rules into routing decision objects.
 *
 * The plugin is pre-configured with metadata such as name, description, and order, and it returns
 * routing decisions as an array if valid rules are found; otherwise, it returns null.
 *
 * @returns A RouterPlugin object with an asynchronous routing evaluation method.
 */
export default function createYearRouterPlugin(
  fastify: FastifyInstance,
): RouterPlugin {
  return {
    name: 'Year Router',
    description: 'Routes content based on release year',
    enabled: true,
    order: 50,

    async evaluateRouting(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      const contentType = context.contentType
      const isMovie = contentType === 'movie'

      // First check if there are any year-based rules for this content type
      const rules = await fastify.db.getRouterRulesByType('year')

      // Filter to only rules for the current content type
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // If no rules exist, skip the expensive API calls
      if (contentTypeRules.length === 0) {
        return null
      }

      // Extract the ID and fetch the year
      let itemId: number | undefined

      if (Array.isArray(item.guids)) {
        // For movies (Radarr), look for tmdbId
        if (isMovie) {
          const tmdbGuid = item.guids.find((guid) => guid.startsWith('tmdb:'))
          if (tmdbGuid) {
            itemId = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
          }
        }
        // For TV shows (Sonarr), look for tvdbId
        else {
          const tvdbGuid = item.guids.find((guid) => guid.startsWith('tvdb:'))
          if (tvdbGuid) {
            itemId = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
          }
        }
      }

      // If we couldn't find an ID, we can't determine the year
      if (!itemId || Number.isNaN(itemId)) {
        fastify.log.warn(
          `Year Router: Couldn't extract ID from item "${item.title}"`,
        )
        return null
      }

      // Fetch the year information based on content type
      let releaseYear: number | undefined

      try {
        if (isMovie) {
          // Use Radarr lookup endpoint to get movie year
          const lookupService = fastify.radarrManager.getRadarrService(1) // Use the first instance for lookups
          if (!lookupService) {
            fastify.log.warn(
              'Year Router: No Radarr service available for year lookup',
            )
            return null
          }

          const movieInfo = await lookupService.getFromRadarr<
            RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
          >(`movie/lookup/tmdb?tmdbId=${itemId}`)

          if (Array.isArray(movieInfo) && movieInfo.length > 0) {
            releaseYear = movieInfo[0].year
          } else if (!Array.isArray(movieInfo) && movieInfo) {
            releaseYear = extractYear(movieInfo)
          }
        } else {
          // Use Sonarr lookup endpoint to get show year
          const lookupService = fastify.sonarrManager.getSonarrService(1) // Use the first instance for lookups
          if (!lookupService) {
            fastify.log.warn(
              'Year Router: No Sonarr service available for year lookup',
            )
            return null
          }

          const showInfo = await lookupService.getFromSonarr<
            SonarrSeriesLookupResponse | SonarrSeriesLookupResponse[]
          >(`series/lookup?term=tvdb:${itemId}`)

          if (Array.isArray(showInfo) && showInfo.length > 0) {
            releaseYear = showInfo[0].year
          } else if (!Array.isArray(showInfo) && showInfo) {
            releaseYear = extractYear(showInfo)
          }
        }
      } catch (error) {
        fastify.log.error(
          `Year Router: Error fetching year information for ${item.title}:`,
          error,
        )
        return null
      }

      // If we couldn't determine the year, skip routing
      if (releaseYear === undefined) {
        fastify.log.warn(
          `Year Router: Couldn't determine year for "${item.title}"`,
        )
        return null
      }

      fastify.log.info(
        `Year Router: Found year ${releaseYear} for "${item.title}"`,
      )

      // Find matching year routes
      const matchingRules = contentTypeRules.filter((rule) => {
        const yearCriteria = rule.criteria.year

        // If no year criteria, return false
        if (yearCriteria === undefined || yearCriteria === null) {
          return false
        }

        // Check if the year matches the criteria
        // We already checked above that releaseYear is not undefined
        return processYearCriteria(releaseYear as number, yearCriteria)
      })

      if (matchingRules.length === 0) {
        return null
      }

      // Convert to routing decisions
      return matchingRules.map((rule) => {
        return {
          instanceId: rule.target_instance_id,
          qualityProfile: rule.quality_profile,
          rootFolder: rule.root_folder,
          weight: rule.order,
        }
      })
    },
  }
}
