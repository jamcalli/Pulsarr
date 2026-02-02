import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'

/**
 * Type guard to check if a value is an array of numbers
 */
function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

/**
 * Type guard to check if a value is a number
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validates that a value is suitable for streaming services evaluation
 * @returns true if value is a number or array of numbers, false otherwise
 */
function isValidStreamingServicesValue(
  value: unknown,
): value is number | number[] {
  return isNumber(value) || isNumberArray(value)
}

/**
 * Constructs a routing evaluator that matches content items to routing rules based on streaming service availability.
 *
 * The evaluator uses TMDB watch provider data to determine if content is available on specified streaming services.
 * This prevents redundant downloads when content is already accessible through user's subscribed services.
 *
 * Supported operators:
 * - `in`: Content is available for streaming (flatrate/subscription) on at least one of the specified services
 * - `notIn`: Content is not available for streaming on any of the specified services
 *
 * @returns A {@link RoutingEvaluator} specialized for streaming availability routing.
 *
 * @remark
 * This evaluator requires watch provider data to be pre-fetched during content enrichment.
 * If watchProviders data is missing, the evaluator returns null and logs a debug message.
 * Only subscription streaming (flatrate) is checked - rental and purchase options are not evaluated.
 */
export default function createStreamingEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata for supported fields
  const supportedFields: FieldInfo[] = [
    {
      name: 'streamingServices',
      description:
        'TMDB provider IDs for streaming services (e.g., [8, 337] for Netflix, Disney+)',
      valueTypes: ['number[]', 'number'],
    },
  ]

  // Define supported operators
  const supportedOperators: Record<string, OperatorInfo[]> = {
    streamingServices: [
      {
        name: 'in',
        description:
          'Content is available on at least one of these streaming services',
        valueTypes: ['number[]', 'number'],
        valueFormat:
          'Single provider ID or array of TMDB provider IDs, e.g., 8 or [8, 337] for Netflix, Disney+',
      },
      {
        name: 'notIn',
        description:
          'Content is not available on any of these streaming services',
        valueTypes: ['number[]', 'number'],
        valueFormat:
          'Single provider ID or array of TMDB provider IDs, e.g., 8 or [8, 15, 384] for Netflix, Hulu, HBO Max',
      },
    ],
  }

  /**
   * Check if content is available on any of the specified streaming services
   *
   * @param item - Content item with watchProviders data
   * @param providerIds - Array of TMDB provider IDs to check against
   * @returns true if content is available on at least one provider, false otherwise
   */
  function isAvailableOnServices(
    item: ContentItem,
    providerIds: number[],
  ): boolean {
    if (!item.watchProviders) {
      return false
    }

    // Get flatrate (subscription streaming) providers only
    const providers = item.watchProviders.flatrate || []

    // Check if any of the specified provider IDs match
    return providers.some((provider) =>
      providerIds.includes(provider.provider_id),
    )
  }

  return {
    name: 'Streaming Availability Router',
    description:
      'Routes content based on streaming service availability to prevent redundant downloads',
    priority: 85, // Higher than genre/imdb (80) but lower than conditional (100)
    ruleType: 'streaming',
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      // Can only evaluate if we have watch provider data
      return !!item.watchProviders
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      _context: RoutingContext,
    ): boolean {
      // Only support the 'streamingServices' field
      if (!('field' in condition) || condition.field !== 'streamingServices') {
        return false
      }

      // Skip if no watch provider data
      if (!item.watchProviders) {
        return false
      }

      const { operator, value, negate: _ = false } = condition

      // Validate the value is a valid type (number or number array)
      if (!isValidStreamingServicesValue(value)) {
        fastify.log.warn(
          `Invalid streamingServices value in condition: expected number or number array, got ${typeof value}`,
        )
        return false
      }

      // Normalize to array - handle both single number and number array
      const providerIds = Array.isArray(value) ? value : [value]

      // Check for empty array
      if (providerIds.length === 0) {
        fastify.log.warn(
          'Invalid streamingServices value in condition: array cannot be empty',
        )
        return false
      }

      let result = false

      // Apply operator logic
      switch (operator) {
        case 'in':
          result = isAvailableOnServices(item, providerIds)
          break

        case 'notIn':
          result = !isAvailableOnServices(item, providerIds)
          break

        default:
          fastify.log.warn(
            `Unsupported operator for streamingServices: ${operator}`,
          )
          return false
      }

      // Do not apply negation here - the content router service handles negation at a higher level.
      // This prevents double-negation issues when condition.negate is true.
      return result
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'streamingServices' field
      return field === 'streamingServices'
    },
  }
}
