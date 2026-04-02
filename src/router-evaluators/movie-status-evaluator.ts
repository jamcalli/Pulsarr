import { isRadarrResponse } from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import { isStringArray } from '@utils/type-guards.js'
import type { FastifyInstance } from 'fastify'

export default function createMovieStatusEvaluator(
  _fastify: FastifyInstance,
): RoutingEvaluator {
  const supportedFields: FieldInfo[] = [
    {
      name: 'movieStatus',
      description:
        'Movie status from Radarr (tba, announced, inCinemas, released, deleted)',
      valueTypes: ['string', 'string[]'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    movieStatus: [
      {
        name: 'equals',
        description: 'Movie status matches exactly',
        valueTypes: ['string'],
      },
      {
        name: 'notEquals',
        description: 'Movie status does not match',
        valueTypes: ['string'],
      },
      {
        name: 'in',
        description: 'Movie status is one of the provided values',
        valueTypes: ['string[]'],
        valueFormat: 'Array of statuses, e.g. ["released", "inCinemas"]',
      },
      {
        name: 'notIn',
        description: 'Movie status is not one of the provided values',
        valueTypes: ['string[]'],
        valueFormat: 'Array of statuses, e.g. ["released", "inCinemas"]',
      },
    ],
  }

  function hasStatusData(item: ContentItem): boolean {
    return (
      item.metadata !== undefined &&
      isRadarrResponse(item.metadata) &&
      !!item.metadata.status
    )
  }

  function extractStatus(item: ContentItem): string | undefined {
    if (item.metadata && isRadarrResponse(item.metadata)) {
      return item.metadata.status
    }
    return undefined
  }

  return {
    name: 'Movie Status Router',
    description: 'Routes movies based on movie status from Radarr',
    priority: 55,
    ruleType: 'movieStatus',
    supportedFields,
    supportedOperators,
    contentType: 'radarr',

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      return context.contentType === 'movie' && hasStatusData(item)
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      if (!('field' in condition) || condition.field !== 'movieStatus') {
        return false
      }

      if (context.contentType !== 'movie' || !hasStatusData(item)) {
        return false
      }

      const status = extractStatus(item)
      if (!status) {
        return false
      }

      const { operator, value } = condition
      const normalizedStatus = status.toLowerCase()

      switch (operator) {
        case 'equals':
          if (typeof value === 'string') {
            return normalizedStatus === value.toLowerCase()
          }
          return false
        case 'notEquals':
          if (typeof value === 'string') {
            return normalizedStatus !== value.toLowerCase()
          }
          return false
        case 'in':
          if (isStringArray(value)) {
            return value.some((v) => normalizedStatus === v.toLowerCase())
          }
          return false
        case 'notIn':
          if (isStringArray(value)) {
            return !value.some((v) => normalizedStatus === v.toLowerCase())
          }
          return false
        default:
          return false
      }
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'movieStatus'
    },
  }
}
