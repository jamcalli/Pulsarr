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
 * Creates a routing evaluator that routes content based on its certification or rating.
 *
 * The evaluator supports routing decisions and condition evaluations using the "certification" field, allowing operators such as equals, notEquals, contains, in, and notIn. It integrates with Radarr and Sonarr metadata to extract certification information and applies routing rules accordingly for movies and TV shows.
 *
 * @returns A {@link RoutingEvaluator} instance that evaluates and routes content items based on their certification metadata.
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
   * Determines whether the content item contains certification data in its metadata.
   *
   * Returns true if the item's metadata is from Radarr or Sonarr and includes a certification field; otherwise, returns false.
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
   * Retrieves the certification string from a content item's metadata if available.
   *
   * @param item - The content item to extract certification from.
   * @returns The certification value if present in Radarr or Sonarr metadata; otherwise, undefined.
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
      context: RoutingContext,
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
      const rules = await fastify.db.getRouterRulesByType('certification')

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

        // Support array form for 'in' and 'notIn' operators
        if (Array.isArray(ruleCertification)) {
          if (operator === 'in') {
            return ruleCertification.some(
              (cert) =>
                typeof cert === 'string' &&
                normalizedCertification === cert.toUpperCase(),
            )
          }
          if (operator === 'notIn') {
            return !ruleCertification.some(
              (cert) =>
                typeof cert === 'string' &&
                normalizedCertification === cert.toUpperCase(),
            )
          }
          // Default to 'in' for backward compatibility
          return ruleCertification.some(
            (cert) =>
              typeof cert === 'string' &&
              normalizedCertification === cert.toUpperCase(),
          )
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
            try {
              const regex = new RegExp(ruleCertification)
              return regex.test(certification)
            } catch (error) {
              fastify.log.error(`Invalid regex in certification rule: ${error}`)
              return false
            }
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
        priority: rule.order || 50, // Default to 50 if not specified
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
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

      const { operator, value, negate = false } = condition

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
            try {
              const regex = new RegExp(value)
              result = regex.test(certification)
            } catch (error) {
              fastify.log.error(
                `Invalid regex in certification condition: ${error}`,
              )
            }
          }
          break
      }

      return negate ? !result : result
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'certification' field
      return field === 'certification'
    },
  }
}
