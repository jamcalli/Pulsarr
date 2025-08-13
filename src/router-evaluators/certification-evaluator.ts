import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  FieldInfo,
  OperatorInfo,
  RouterRule,
} from '@root/types/router.types.js'
import {
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'
import { evaluateRegexSafely } from '@utils/regex-safety.js'

/**
 * Creates a routing evaluator that determines routing decisions and evaluates conditions based on the certification or rating metadata of Radarr and Sonarr content items.
 *
 * The evaluator supports the "certification" field with operators such as equals, notEquals, contains, notContains, in, notIn, and regex. It extracts certification information from content metadata and matches it against routing rules for movies and TV shows to produce routing decisions.
 *
 * @returns A {@link RoutingEvaluator} that routes content items according to their certification metadata.
 *
 * @remark
 * Regular expression operators are evaluated with safety checks to prevent unsafe or catastrophic patterns. Only the "certification" field is supported for evaluation and condition checks.
 */
export default function createCertificationEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata with only one clean field name
  const supportedFields: FieldInfo[] = [
    {
      name: 'certification',
      description: 'Content rating/certification (PG-13, R, TV-MA, etc.)',
      valueTypes: ['string', 'string[]'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    certification: [
      {
        name: 'equals',
        description: 'Certification matches exactly',
        valueTypes: ['string'],
      },
      {
        name: 'notEquals',
        description: 'Certification does not match',
        valueTypes: ['string'],
      },
      {
        name: 'contains',
        description: 'Certification contains this string',
        valueTypes: ['string'],
      },
      {
        name: 'notContains',
        description: 'Certification does not contain this string',
        valueTypes: ['string'],
      },
      {
        name: 'in',
        description: 'Certification is one of the provided values',
        valueTypes: ['string[]'],
        valueFormat: 'Array of certifications, e.g. ["PG-13", "PG", "G"]',
      },
      {
        name: 'notIn',
        description: 'Certification is not one of the provided values',
        valueTypes: ['string[]'],
        valueFormat: 'Array of certifications, e.g. ["R", "NC-17"]',
      },
      {
        name: 'regex',
        description: 'Certification matches the regular expression',
        valueTypes: ['string'],
      },
    ],
  }

  /**
   * Determines whether a content item contains certification data in its Radarr or Sonarr metadata.
   *
   * @returns True if the item's metadata includes a certification field; otherwise, false.
   */
  function hasCertificationData(item: ContentItem): boolean {
    if (item.metadata) {
      if (isRadarrResponse(item.metadata) || isSonarrResponse(item.metadata)) {
        return !!item.metadata.certification
      }
    }
    return false
  }

  /**
   * Retrieves the certification string from Radarr or Sonarr metadata on a content item.
   *
   * @param item - The content item from which to extract certification metadata.
   * @returns The certification string if available; otherwise, undefined.
   */
  function extractCertification(item: ContentItem): string | undefined {
    if (item.metadata) {
      if (
        (isRadarrResponse(item.metadata) || isSonarrResponse(item.metadata)) &&
        item.metadata.certification
      ) {
        return item.metadata.certification
      }
    }
    return undefined
  }

  return {
    name: 'Certification Router',
    description: 'Routes content based on certification/rating',
    priority: 60, // Lower than language (65) but higher than others
    supportedFields,
    supportedOperators,

    // Allow these helper methods to be accessed - they're part of the evaluator
    hasCertificationData,
    extractCertification,

    async canEvaluate(
      item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      return hasCertificationData(item)
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      if (!hasCertificationData(item)) {
        return null
      }

      const certification = extractCertification(item)
      if (!certification) {
        return null
      }

      const isMovie = context.contentType === 'movie'

      let rules: RouterRule[] = []
      try {
        rules = await fastify.db.getRouterRulesByType('certification')
      } catch (err) {
        fastify.log.error(
          { error: err },
          'Certification evaluator - DB query failed',
        )
        return null
      }

      // Filter rules by target type and ensure they're enabled
      const contentTypeRules = rules.filter(
        (rule) =>
          rule.target_type === (isMovie ? 'radarr' : 'sonarr') &&
          rule.enabled !== false,
      )

      // Find matching certification rules - only check 'certification' field
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.certification) {
          return false
        }

        const ruleCertification = rule.criteria.certification
        const operator = rule.criteria.operator || 'equals'

        // Normalize certification for comparison
        const normalizedCertification = certification.toUpperCase()

        // Support array form for 'in' and 'notIn' operators only
        if (Array.isArray(ruleCertification)) {
          switch (operator) {
            case 'in':
              return ruleCertification.some(
                (cert) =>
                  typeof cert === 'string' &&
                  normalizedCertification === cert.toUpperCase(),
              )
            case 'notIn':
              return !ruleCertification.some(
                (cert) =>
                  typeof cert === 'string' &&
                  normalizedCertification === cert.toUpperCase(),
              )
            default:
              // Reject invalid operator + array combinations
              fastify.log.warn(
                `Invalid operator '${operator}' used with array in certification rule`,
              )
              return false
          }
        }

        // Ensure the criterion value is a non-empty string for direct comparison
        if (
          typeof ruleCertification !== 'string' ||
          ruleCertification.trim() === ''
        ) {
          return false
        }

        const normalizedRuleCertification = ruleCertification.toUpperCase()

        // Handle string operators
        switch (operator) {
          case 'equals':
            return normalizedCertification === normalizedRuleCertification
          case 'notEquals':
            return normalizedCertification !== normalizedRuleCertification
          case 'contains':
            return normalizedCertification.includes(normalizedRuleCertification)
          case 'notContains':
            return !normalizedCertification.includes(
              normalizedRuleCertification,
            )
          case 'regex':
            return evaluateRegexSafely(
              ruleCertification,
              certification,
              fastify.log,
              'certification rule',
            )
          default:
            // Default to equals for backward compatibility
            return normalizedCertification === normalizedRuleCertification
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
        tags: rule.tags || [],
        priority: rule.order ?? 50, // Default to 50 if undefined or null
        searchOnAdd: rule.search_on_add,
        seasonMonitoring: rule.season_monitoring,
        seriesType: rule.series_type,
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      _context: RoutingContext,
    ): boolean {
      // Only support the 'certification' field
      if (!('field' in condition) || condition.field !== 'certification') {
        return false
      }

      if (!hasCertificationData(item)) {
        return false
      }

      const certification = extractCertification(item)
      if (!certification) {
        return false
      }

      const { operator, value, negate: _ = false } = condition

      // Normalize for comparison
      const normalizedCertification = certification.toUpperCase()
      let result = false

      switch (operator) {
        case 'equals':
          if (typeof value === 'string') {
            result = normalizedCertification === value.toUpperCase()
          }
          break
        case 'notEquals':
          if (typeof value === 'string') {
            result = normalizedCertification !== value.toUpperCase()
          }
          break
        case 'contains':
          if (typeof value === 'string') {
            result = normalizedCertification.includes(value.toUpperCase())
          }
          break
        case 'notContains':
          if (typeof value === 'string') {
            result = !normalizedCertification.includes(value.toUpperCase())
          }
          break
        case 'in':
          if (Array.isArray(value)) {
            result = value.some(
              (cert) =>
                typeof cert === 'string' &&
                normalizedCertification === cert.toUpperCase(),
            )
          }
          break
        case 'notIn':
          if (Array.isArray(value)) {
            result = !value.some(
              (cert) =>
                typeof cert === 'string' &&
                normalizedCertification === cert.toUpperCase(),
            )
          }
          break
        case 'regex':
          if (typeof value === 'string') {
            result = evaluateRegexSafely(
              value,
              certification,
              fastify.log,
              'certification condition',
            )
          }
          break
      }

      // Do not apply negation here - the content router service handles negation at a higher level.
      // This prevents double-negation issues when condition.negate is true.
      return result
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'certification' field
      return field === 'certification'
    },
  }
}
