import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import { isString } from '@utils/type-guards.js'
import type { FastifyInstance } from 'fastify'

export default function createListEvaluator(
  _fastify: FastifyInstance,
): RoutingEvaluator {
  const supportedFields: FieldInfo[] = [
    {
      name: 'plexList',
      description: 'Plex custom list name owned by the requesting user',
      valueTypes: ['string'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    plexList: [
      {
        name: 'equals',
        description: 'Item is on a list with this exact name',
        valueTypes: ['string'],
      },
      {
        name: 'notEquals',
        description: 'Item is not on a list with this exact name',
        valueTypes: ['string'],
      },
      {
        name: 'contains',
        description: 'Item is on a list whose name contains this string',
        valueTypes: ['string'],
      },
      {
        name: 'notContains',
        description: 'Item is not on any list whose name contains this string',
        valueTypes: ['string'],
      },
    ],
  }

  return {
    name: 'Plex List Router',
    description: 'Routes content based on Plex custom list membership',
    priority: 50,
    ruleType: 'plexList',
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      return item.listMemberships !== undefined
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      _context: RoutingContext,
    ): boolean {
      if (!('field' in condition) || condition.field !== 'plexList') {
        return false
      }

      if (!item.listMemberships) {
        return false
      }

      const { operator, value } = condition
      if (!isString(value)) return false

      const normalizedValue = value.toLowerCase().trim()
      const membershipNames = item.listMemberships

      switch (operator) {
        case 'equals':
          return membershipNames.has(normalizedValue)
        case 'notEquals':
          return !membershipNames.has(normalizedValue)
        case 'contains':
          for (const name of membershipNames) {
            if (name.includes(normalizedValue)) return true
          }
          return false
        case 'notContains':
          for (const name of membershipNames) {
            if (name.includes(normalizedValue)) return false
          }
          return true
        default:
          return false
      }
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'plexList'
    },
  }
}
