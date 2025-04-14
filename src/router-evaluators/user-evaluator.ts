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

export default function createUserEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata about the supported fields and operators
  const supportedFields: FieldInfo[] = [
    {
      name: 'user',
      description: 'The user requesting the content',
      valueTypes: ['string', 'number', 'string[]', 'number[]'],
    },
    {
      name: 'userId',
      description: 'The numeric ID of the requesting user',
      valueTypes: ['number', 'string', 'number[]', 'string[]'],
    },
    {
      name: 'userName',
      description: 'The username of the requesting user',
      valueTypes: ['string', 'string[]'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    user: [
      {
        name: 'equals',
        description: 'User matches exactly (by ID or username)',
        valueTypes: ['string', 'number'],
      },
      {
        name: 'in',
        description: 'User is one of the provided values',
        valueTypes: ['string[]', 'number[]'],
        valueFormat:
          'Array of user IDs or usernames, e.g. ["admin", "john", 42]',
      },
    ],
    userId: [
      {
        name: 'equals',
        description: 'User ID matches exactly',
        valueTypes: ['number', 'string'],
      },
      {
        name: 'in',
        description: 'User ID is one of the provided values',
        valueTypes: ['number[]', 'string[]'],
        valueFormat: 'Array of user IDs, e.g. [1, 2, 3] or ["1", "2", "3"]',
      },
    ],
    userName: [
      {
        name: 'equals',
        description: 'Username matches exactly',
        valueTypes: ['string'],
      },
      {
        name: 'in',
        description: 'Username is one of the provided values',
        valueTypes: ['string[]'],
        valueFormat: 'Array of usernames, e.g. ["admin", "john", "sarah"]',
      },
    ],
  }

  return {
    name: 'User Router',
    description: 'Routes content based on requesting users',
    priority: 75,
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      return !!(context.userId || context.userName)
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      // Skip if no user information available
      if (!context.userId && !context.userName) {
        return null
      }

      const isMovie = context.contentType === 'movie'
      const rules = await fastify.db.getRouterRulesByType('user')

      // Filter to only rules for the current content type
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // Find matching rules based on user criteria
      const matchingRules = contentTypeRules.filter((rule) => {
        // Check if rule.criteria has a users property
        if (!rule.criteria || !rule.criteria.users) {
          return false
        }

        const usersArray = Array.isArray(rule.criteria.users)
          ? rule.criteria.users
          : [rule.criteria.users]

        // Check if context.userId matches any user in the list
        if (context.userId) {
          const userIdStr = context.userId.toString()
          if (
            usersArray.includes(userIdStr) ||
            usersArray.includes(context.userId)
          ) {
            return true
          }
        }

        // Check if context.userName matches any user in the list
        if (context.userName && usersArray.includes(context.userName)) {
          return true
        }

        return false
      })

      if (matchingRules.length === 0) {
        return null
      }

      // Convert matching rules to routing decisions
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
      // Handle only user-specific conditions
      if (
        !('field' in condition) ||
        (condition.field !== 'user' &&
          condition.field !== 'userId' &&
          condition.field !== 'userName')
      ) {
        return false
      }

      // Skip if no user information available
      if (!context.userId && !context.userName) {
        return false
      }

      const { operator, value } = condition

      if (operator === 'equals') {
        // Check user ID
        if (
          context.userId &&
          (value === context.userId || value === context.userId.toString())
        ) {
          return true
        }

        // Check username
        if (context.userName && value === context.userName) {
          return true
        }
      }

      if (operator === 'in') {
        const users = Array.isArray(value) ? value : [value]

        // Check user ID
        if (context.userId) {
          const userIdStr = context.userId.toString()
          if (users.includes(context.userId) || users.includes(userIdStr)) {
            return true
          }
        }

        // Check username
        if (context.userName && users.includes(context.userName)) {
          return true
        }
      }

      return false
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'user' || field === 'userId' || field === 'userName'
    },
  }
}
