// src/router-plugins/language-route.plugin.ts
import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
  CriteriaValue, // Ensure this type is correctly defined/imported
} from '@root/types/router.types.js'
import {
  type RadarrMovieLookupResponse,
  type SonarrSeriesLookupResponse,
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'

// Define ApiResponse as unknown if it's not already defined elsewhere
type ApiResponse = unknown

// Helper to safely extract the language name from various API responses
function extractLanguageName(
  response:
    | RadarrMovieLookupResponse
    | SonarrSeriesLookupResponse
    | ApiResponse // Use the generic ApiResponse type
    | Array<RadarrMovieLookupResponse | SonarrSeriesLookupResponse>, // Handle array responses
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
    // Cast to the expected union type for type checking
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

// Factory function to create the Language Router Plugin
export default function createLanguageRouterPlugin(
  fastify: FastifyInstance,
): RouterPlugin {
  return {
    name: 'Language Router',
    description: 'Routes content based on original language',
    enabled: true, // Enabled by default
    order: 50, // Priority relative to other plugins

    async evaluateRouting(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      const contentType = context.contentType
      const isMovie = contentType === 'movie'

      const rules = await fastify.db.getRouterRulesByType('language')

      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      if (contentTypeRules.length === 0) {
        return null
      }

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

      if (!itemId || Number.isNaN(itemId)) {
        fastify.log.warn(
          `Language Router: Couldn't extract ${isMovie ? 'TMDB' : 'TVDB'} ID from item "${item.title}"`,
          { guids: item.guids },
        )
        return null
      }
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
          const apiResponse = await lookupService.getFromRadarr<ApiResponse>(
            `movie/lookup/tmdb?tmdbId=${itemId}`,
          )
          originalLanguageName = extractLanguageName(
            apiResponse as
              | RadarrMovieLookupResponse
              | RadarrMovieLookupResponse[]
              | ApiResponse,
          )
        } else {
          const lookupService = fastify.sonarrManager.getSonarrService(1) // Get Sonarr service
          if (!lookupService) {
            fastify.log.warn(
              'Language Router: No Sonarr service available for language lookup',
            )
            return null
          }
          // *** FIXED: Construct endpoint string directly in the call ***
          const apiResponse = await lookupService.getFromSonarr<ApiResponse>(
            `series/lookup?term=tvdb:${itemId}`, // Construct endpoint inline
          )
          originalLanguageName = extractLanguageName(
            apiResponse as
              | SonarrSeriesLookupResponse
              | SonarrSeriesLookupResponse[]
              | ApiResponse,
          )
        }
      } catch (error) {
        fastify.log.error(
          `Language Router: Error fetching language information for ${item.title}:`,
          error,
        )
        return null // Return null on API error
      }

      // 7. If the language couldn't be determined from the API response, stop processing
      if (!originalLanguageName) {
        fastify.log.warn(
          `Language Router: Couldn't determine original language for "${item.title}"`,
          { itemId },
        )
        return null
      }

      fastify.log.info(
        `Language Router: Found language "${originalLanguageName}" for "${item.title}"`,
      )

      // 8. Filter the rules to find ones matching the extracted language
      const matchingRules = contentTypeRules.filter((rule) => {
        // Access the language criterion from the rule's JSON criteria
        const ruleLanguage = rule.criteria.originalLanguage

        // Ensure the criterion value is a non-empty string
        if (typeof ruleLanguage !== 'string' || ruleLanguage.trim() === '') {
          return false
        }

        // Perform a case-insensitive comparison
        return originalLanguageName.toLowerCase() === ruleLanguage.toLowerCase()
      })

      // 9. If no rules match the language, stop processing
      if (matchingRules.length === 0) {
        fastify.log.info(
          `Language Router: No matching language rules found for "${originalLanguageName}"`,
        )
        return null
      }

      fastify.log.info(
        `Language Router: Found ${matchingRules.length} matching rule(s) for language "${originalLanguageName}"`,
      )

      // 10. Convert the matching rules into routing decisions
      return matchingRules.map((rule) => ({
        instanceId: rule.target_instance_id,
        qualityProfile: rule.quality_profile,
        rootFolder: rule.root_folder,
        weight: rule.order, // Use the rule's order property as the weight
      }))
    },
  }
}
