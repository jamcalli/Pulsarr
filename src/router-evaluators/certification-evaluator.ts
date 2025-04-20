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
 * Creates a routing evaluator that routes content based on its certification/rating.
 *
 * The evaluator supports routing decisions and condition evaluations using the "certification" field,
 * with operators for equality, inequality, substring containment, and set membership. It integrates
 * with Radarr and Sonarr content metadata to make appropriate routing decisions based on content ratings.
 *
 * @returns A {@link RoutingEvaluator} instance that routes content according to its certification.
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
    ],
  }

  // Helper function to check if we have certification data
  function hasCertificationData(item: ContentItem): boolean {
    if (item.metadata) {
      if (isRadarrResponse(item.metadata) || isSonarrResponse(item.metadata)) {
        return !!item.metadata.certification
      }
    }
    return false
  }

  // Helper for extracting certification
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

      // Filter rules by target type
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // Find matching certification rules - only check 'certification' field
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.certification) {
          return false
        }

        const ruleCertification = rule.criteria.certification

        // Support array form for the 'in' operator
        if (Array.isArray(ruleCertification)) {
          return ruleCertification.some(
            (cert) =>
              typeof cert === 'string' &&
              certification.toUpperCase() === cert.toUpperCase(),
          )
        }

        // Ensure the criterion value is a non-empty string for direct comparison
        if (
          typeof ruleCertification !== 'string' ||
          ruleCertification.trim() === ''
        ) {
          return false
        }

        // Perform a case-insensitive comparison
        return certification.toUpperCase() === ruleCertification.toUpperCase()
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
      condition: Condition | ConditionGroup,
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

      const { operator, value } = condition

      // Normalize for comparison
      const normalizedCertification = certification.toUpperCase()

      if (operator === 'equals') {
        if (typeof value === 'string') {
          return normalizedCertification === value.toUpperCase()
        }
        return false
      }

      if (operator === 'notEquals') {
        if (typeof value === 'string') {
          return normalizedCertification !== value.toUpperCase()
        }
        return false
      }

      if (operator === 'contains') {
        if (typeof value === 'string') {
          return normalizedCertification.includes(value.toUpperCase())
        }
        return false
      }

      if (operator === 'in') {
        if (Array.isArray(value)) {
          return value.some(
            (cert) =>
              typeof cert === 'string' &&
              normalizedCertification === cert.toUpperCase(),
          )
        }
        return false
      }

      if (operator === 'notIn') {
        if (Array.isArray(value)) {
          return !value.some(
            (cert) =>
              typeof cert === 'string' &&
              normalizedCertification === cert.toUpperCase(),
          )
        }
        return false
      }

      return false
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'certification' field
      return field === 'certification'
    },
  }
}
