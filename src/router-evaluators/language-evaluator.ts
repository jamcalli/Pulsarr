import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  ConditionGroup,
  FieldInfo,
  OperatorInfo,
} from '@root/types/router.types.js'
import {
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'

/**
 * Creates a routing evaluator that directs content based on its original language metadata.
 *
 * The returned evaluator enables routing decisions and condition evaluations using the "language" field, supporting operators for equality, inequality, substring containment, and set membership. It integrates with Radarr and Sonarr metadata and retrieves routing rules from the database to determine routing outcomes.
 *
 * @returns A {@link RoutingEvaluator} instance that routes content according to its original language.
 */
export default function createLanguageEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata with only one clean field name
  const supportedFields: FieldInfo[] = [
    {
      name: 'language',
      description: 'Original language of the content',
      valueTypes: ['string', 'string[]'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    language: [
      {
        name: 'equals',
        description: 'Language matches exactly',
        valueTypes: ['string'],
      },
      {
        name: 'notEquals',
        description: 'Language does not match',
        valueTypes: ['string'],
      },
      {
        name: 'contains',
        description: 'Language name contains this string',
        valueTypes: ['string'],
      },
      {
        name: 'in',
        description: 'Language is one of the provided values',
        valueTypes: ['string[]'],
        valueFormat:
          'Array of language names, e.g. ["English", "French", "Japanese"]',
      },
    ],
  }

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
    supportedFields,
    supportedOperators,

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

      // Find matching language rules - only check 'language' field
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.language) {
          return false
        }

        const ruleLanguage = rule.criteria.language

        // If no language data, skip the rule
        if (!language) {
          return false
        }

        // Support array form from the 'in' operator
        if (Array.isArray(ruleLanguage)) {
          return ruleLanguage.some(
            (lang) =>
              typeof lang === 'string' &&
              language.toLowerCase() === lang.toLowerCase(),
          )
        }

        // Ensure the criterion value is a non-empty string for direct comparison
        if (typeof ruleLanguage !== 'string' || ruleLanguage.trim() === '') {
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
        priority: rule.order || 50, // Default to 50 if not specified
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      // Only support the 'language' field
      if (!('field' in condition) || condition.field !== 'language') {
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
      // Only support the 'language' field
      return field === 'language'
    },
  }
}
