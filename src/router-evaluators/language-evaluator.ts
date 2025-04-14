import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  ConditionGroup,
} from '@root/types/router.types.js'
import {
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'

export default function createLanguageEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define this as a normal function - it will be part of the evaluator due to index signature
  function hasLanguageData(item: ContentItem): boolean {
    if (item.metadata) {
      if (isRadarrResponse(item.metadata) || isSonarrResponse(item.metadata)) {
        return !!item.metadata.originalLanguage?.name
      }
    }
    return false
  }

  // Helper for extracting language
  function extractLanguage(item: ContentItem): string | undefined {
    if (item.metadata) {
      if (
        (isRadarrResponse(item.metadata) || isSonarrResponse(item.metadata)) &&
        item.metadata.originalLanguage?.name
      ) {
        return item.metadata.originalLanguage.name
      }
    }
    return undefined
  }

  return {
    name: 'Language Router',
    description: 'Routes content based on original language',
    priority: 65,

    // Allow these helper methods to be accessed - they're part of the evaluator
    hasLanguageData,
    extractLanguage,

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      return hasLanguageData(item)
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      if (!hasLanguageData(item)) {
        return null
      }

      const language = extractLanguage(item)
      if (!language) {
        return null
      }

      const isMovie = context.contentType === 'movie'
      const rules = await fastify.db.getRouterRulesByType('language')

      // Filter rules by target type
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // Find matching language rules
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.originalLanguage) {
          return false
        }

        const ruleLanguage = rule.criteria.originalLanguage

        // Ensure the criterion value is a non-empty string
        if (
          !language ||
          typeof ruleLanguage !== 'string' ||
          ruleLanguage.trim() === ''
        ) {
          return false
        }

        // Perform a case-insensitive comparison
        return language.toLowerCase() === ruleLanguage.toLowerCase()
      })

      if (matchingRules.length === 0) {
        return null
      }

      // Convert to routing decisions
      return matchingRules.map((rule) => ({
        instanceId: rule.target_instance_id,
        qualityProfile: rule.quality_profile,
        rootFolder: rule.root_folder,
        priority: rule.order,
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition | ConditionGroup,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      // Handle only language-specific conditions
      if (
        !('field' in condition) ||
        (condition.field !== 'language' &&
          condition.field !== 'originalLanguage')
      ) {
        return false
      }

      if (!hasLanguageData(item)) {
        return false
      }

      const language = extractLanguage(item)
      if (!language) {
        return false
      }

      const { operator, value } = condition

      // Normalize for comparison
      const normalizedLanguage = language.toLowerCase()
      const normalizedValue =
        typeof value === 'string' ? value.toLowerCase() : value

      if (operator === 'equals') {
        return normalizedLanguage === normalizedValue
      }

      if (operator === 'notEquals') {
        return normalizedLanguage !== normalizedValue
      }

      if (operator === 'contains') {
        if (typeof normalizedValue === 'string') {
          return normalizedLanguage.includes(normalizedValue)
        }
        return false
      }

      if (operator === 'in') {
        if (Array.isArray(value)) {
          return value.some(
            (lang) =>
              typeof lang === 'string' &&
              normalizedLanguage === lang.toLowerCase(),
          )
        }
        return false
      }

      return false
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'language' || field === 'originalLanguage'
    },
  }
}
