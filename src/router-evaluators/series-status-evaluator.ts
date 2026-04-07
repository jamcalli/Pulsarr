import { isSonarrResponse } from '@root/types/content-lookup.types.js'
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

export default function createSeriesStatusEvaluator(
  _fastify: FastifyInstance,
): RoutingEvaluator {
  const supportedFields: FieldInfo[] = [
    {
      name: 'seriesStatus',
      description:
        'Series status from Sonarr (continuing, ended, upcoming, deleted)',
      valueTypes: ['string', 'string[]'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    seriesStatus: [
      {
        name: 'equals',
        description: 'Series status matches exactly',
        valueTypes: ['string'],
      },
      {
        name: 'notEquals',
        description: 'Series status does not match',
        valueTypes: ['string'],
      },
      {
        name: 'in',
        description: 'Series status is one of the provided values',
        valueTypes: ['string[]'],
        valueFormat: 'Array of statuses, e.g. ["continuing", "ended"]',
      },
      {
        name: 'notIn',
        description: 'Series status is not one of the provided values',
        valueTypes: ['string[]'],
        valueFormat: 'Array of statuses, e.g. ["continuing", "ended"]',
      },
    ],
  }

  function hasStatusData(item: ContentItem): boolean {
    return (
      item.metadata !== undefined &&
      isSonarrResponse(item.metadata) &&
      !!item.metadata.status
    )
  }

  function extractStatus(item: ContentItem): string | undefined {
    if (item.metadata && isSonarrResponse(item.metadata)) {
      return item.metadata.status
    }
    return undefined
  }

  return {
    name: 'Series Status Router',
    description: 'Routes TV shows based on series status from Sonarr',
    priority: 55,
    ruleType: 'seriesStatus',
    supportedFields,
    supportedOperators,
    contentType: 'sonarr',

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      return context.contentType === 'show' && hasStatusData(item)
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      if (!('field' in condition) || condition.field !== 'seriesStatus') {
        return false
      }

      if (context.contentType !== 'show' || !hasStatusData(item)) {
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
      return field === 'seriesStatus'
    },
  }
}
