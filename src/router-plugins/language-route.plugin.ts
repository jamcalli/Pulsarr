import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import {
  type RadarrMovieLookupResponse,
  type SonarrSeriesLookupResponse,
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'

/**
 * Extracts the original language name from a Radarr or Sonarr lookup response.
 *
 * This helper handles responses that may be a single object or an array of objects. If an array is provided, the first element is used.
 * The function validates that the response conforms to the expected structure and checks for the existence of an original language name.
 * It returns the language name if present; otherwise, it returns undefined.
 *
 * @param response - The API response containing language details, either as a single lookup response, an array of responses, or an unknown type.
 * @returns The original language name if found; otherwise, undefined.
 */
function extractLanguageName(
  response:
    | RadarrMovieLookupResponse
    | SonarrSeriesLookupResponse
    | unknown
    | Array<RadarrMovieLookupResponse | SonarrSeriesLookupResponse>,
): string | undefined {
  let targetResponse:
    | RadarrMovieLookupResponse
    | SonarrSeriesLookupResponse
    | undefined

  // Handle array response: take the first element if the array is not empty
  if (Array.isArray(response) && response.length > 0) {
    targetResponse = response[0]
  }
  // Handle single object response
  else if (!Array.isArray(response) && response) {
    targetResponse = response as
      | RadarrMovieLookupResponse
      | SonarrSeriesLookupResponse
  }

  // If no valid target response was found, return undefined
  if (!targetResponse) {
    return undefined
  }

  // Check if the response matches Radarr or Sonarr structure and has the language property
  if (
    (isRadarrResponse(targetResponse) || isSonarrResponse(targetResponse)) &&
    targetResponse.originalLanguage?.name
  ) {
    // Return the language name if found
    return targetResponse.originalLanguage.name
  }

  // Return undefined if the language name cannot be extracted
  return undefined
}

/**
 * Creates a Fastify router plugin for routing content based on its original language.
 *
 * The returned plugin includes metadata (name, description, enabled status, and execution order) and an
 * asynchronous evaluateRouting method. This method retrieves language-based routing rules, extracts a valid
 * identifier from the content item's GUIDs, and uses a lookup service (Radarr for movies, Sonarr for series)
 * to determine the item's original language. It then filters the routing rules by matching the original language
 * (using a case-insensitive comparison) and returns a list of routing decisions or null if no applicable rules are found.
 *
 * @returns A RouterPlugin object implementing language-based routing logic.
 */
export default function createLanguageRouterPlugin(
  fastify: FastifyInstance,
): RouterPlugin {
  return {
    name: 'Language Router',
    description: 'Routes content based on original language',
    enabled: true,
    order: 50,

    async evaluateRouting(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      const isMovie = context.contentType === 'movie'

      // First check if there are any language-based rules for this content type
      const rules = await fastify.db.getRouterRulesByType('language')

      // Filter to only rules for the current content type
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // If no rules exist, skip the expensive API calls
      if (contentTypeRules.length === 0) {
        return null
      }

      // Extract the ID
      let itemId: number | undefined

      if (Array.isArray(item.guids)) {
        if (isMovie) {
          const tmdbGuid = item.guids.find((guid) => guid.startsWith('tmdb:'))
          if (tmdbGuid) {
            itemId = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
          }
        } else {
          const tvdbGuid = item.guids.find((guid) => guid.startsWith('tvdb:'))
          if (tvdbGuid) {
            itemId = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
          }
        }
      }

      // If we couldn't find an ID, we can't determine the language
      if (!itemId || Number.isNaN(itemId)) {
        fastify.log.warn(
          `Language Router: Couldn't extract ID from item "${item.title}"`,
        )
        return null
      }

      // Fetch the language information based on content type
      let originalLanguageName: string | undefined

      try {
        if (isMovie) {
          const lookupService = fastify.radarrManager.getRadarrService(1)
          if (!lookupService) {
            fastify.log.warn(
              'Language Router: No Radarr service available for language lookup',
            )
            return null
          }

          const apiResponse = await lookupService.getFromRadarr<unknown>(
            `movie/lookup/tmdb?tmdbId=${itemId}`,
          )
          originalLanguageName = extractLanguageName(
            apiResponse as
              | RadarrMovieLookupResponse
              | RadarrMovieLookupResponse[]
              | unknown,
          )
        } else {
          const lookupService = fastify.sonarrManager.getSonarrService(1)
          if (!lookupService) {
            fastify.log.warn(
              'Language Router: No Sonarr service available for language lookup',
            )
            return null
          }

          const apiResponse = await lookupService.getFromSonarr<unknown>(
            `series/lookup?term=tvdb:${itemId}`,
          )
          originalLanguageName = extractLanguageName(
            apiResponse as
              | SonarrSeriesLookupResponse
              | SonarrSeriesLookupResponse[]
              | unknown,
          )
        }
      } catch (error) {
        fastify.log.error(
          `Language Router: Error fetching language information for ${item.title}:`,
          error,
        )
        return null
      }

      // If we couldn't determine the language, skip routing
      if (!originalLanguageName) {
        fastify.log.warn(
          `Language Router: Couldn't determine original language for "${item.title}"`,
        )
        return null
      }

      fastify.log.info(
        `Language Router: Found language "${originalLanguageName}" for "${item.title}"`,
      )

      // Find matching language routes
      const matchingRules = contentTypeRules.filter((rule) => {
        const ruleLanguage = rule.criteria.originalLanguage

        // Ensure the criterion value is a non-empty string
        if (
          !originalLanguageName ||
          typeof ruleLanguage !== 'string' ||
          ruleLanguage.trim() === ''
        ) {
          return false
        }

        // Perform a case-insensitive comparison
        return originalLanguageName.toLowerCase() === ruleLanguage.toLowerCase()
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
