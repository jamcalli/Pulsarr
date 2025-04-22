import type { FastifyInstance } from 'fastify'
import {
  type ContentItem,
  type RoutingContext,
  type RoutingDecision,
  type RoutingEvaluator,
  type Condition,
  ConditionGroup,
  type FieldInfo,
  type OperatorInfo,
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
        name: 'notContains',
        description: 'Language name does not contain this string',
        valueTypes: ['string'],
      },
      {
        name: 'in',
        description: 'Language is one of the provided values',
        valueTypes: ['string[]'],
        valueFormat:
          'Array of language names, e.g. ["English", "French", "Japanese"]',
      },
      {
        name: 'notIn',
        description: 'Language is not any of the provided values',
        valueTypes: ['string[]'],
        valueFormat:
          'Array of language names to exclude, e.g. ["English", "French"]',
      },
      {
        name: 'regex',
        description: 'Language matches the regular expression',
        valueTypes: ['string'],
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

      // Filter rules by target type and enabled status
      const contentTypeRules = rules.filter(
        (rule) =>
          rule.target_type === (isMovie ? 'radarr' : 'sonarr') &&
          rule.enabled !== false,
      )

      // Find matching language rules - check 'language' field with various operators
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.language) {
          return false
        }

        const ruleLanguage = rule.criteria.language
        const operator = rule.criteria.operator || 'equals'

        // If no language data, skip the rule
        if (!language) {
          return false
        }

        // Normalize for case-insensitive comparison
        const normalizedLanguage = language.toLowerCase()

        // Handle array operators (in/notIn)
        if (Array.isArray(ruleLanguage)) {
          if (operator === 'in') {
            return ruleLanguage.some(
              (lang) =>
                typeof lang === 'string' &&
                normalizedLanguage === lang.toLowerCase(),
            )
          }
          if (operator === 'notIn') {
            return !ruleLanguage.some(
              (lang) =>
                typeof lang === 'string' &&
                normalizedLanguage === lang.toLowerCase(),
            )
          }
          // Default to 'in' for backward compatibility
          return ruleLanguage.some(
            (lang) =>
              typeof lang === 'string' &&
              normalizedLanguage === lang.toLowerCase(),
          )
        }

        // Ensure the criterion value is a non-empty string for direct comparison
        if (typeof ruleLanguage !== 'string' || ruleLanguage.trim() === '') {
          return false
        }

        const normalizedRuleLanguage = ruleLanguage.toLowerCase()

        // Handle string operators
        switch (operator) {
          case 'equals':
            return normalizedLanguage === normalizedRuleLanguage
          case 'notEquals':
            return normalizedLanguage !== normalizedRuleLanguage
          case 'contains':
            return normalizedLanguage.includes(normalizedRuleLanguage)
          case 'notContains':
            return !normalizedLanguage.includes(normalizedRuleLanguage)
          case 'regex':
            try {
              const regex = new RegExp(ruleLanguage)
              return regex.test(language)
            } catch (error) {
              fastify.log.error(`Invalid regex in language rule: ${error}`)
              return false
            }
          default:
            // Default to equals for backward compatibility
            return normalizedLanguage === normalizedRuleLanguage
        }
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

      const { operator, value, negate = false } = condition

      // Normalize for comparison
      const normalizedLanguage = language.toLowerCase()
      let result = false

      switch (operator) {
        case 'equals':
          if (typeof value === 'string') {
            result = normalizedLanguage === value.toLowerCase()
          }
          break
        case 'notEquals':
          if (typeof value === 'string') {
            result = normalizedLanguage !== value.toLowerCase()
          }
          break
        case 'contains':
          if (typeof value === 'string') {
            result = normalizedLanguage.includes(value.toLowerCase())
          }
          break
        case 'notContains':
          if (typeof value === 'string') {
            result = !normalizedLanguage.includes(value.toLowerCase())
          }
          break
        case 'in':
          if (Array.isArray(value)) {
            result = value.some(
              (lang) =>
                typeof lang === 'string' &&
                normalizedLanguage === lang.toLowerCase(),
            )
          }
          break
        case 'notIn':
          if (Array.isArray(value)) {
            result = !value.some(
              (lang) =>
                typeof lang === 'string' &&
                normalizedLanguage === lang.toLowerCase(),
            )
          }
          break
        case 'regex':
          if (typeof value === 'string') {
            try {
              const regex = new RegExp(value)
              result = regex.test(language)
            } catch (error) {
              fastify.log.error(`Invalid regex in language condition: ${error}`)
            }
          }
          break
      }

      return negate ? !result : result
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'language' field
      return field === 'language'
    },
  }
}
