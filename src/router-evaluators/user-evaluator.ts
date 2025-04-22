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

/**
 * Creates a routing evaluator that determines content routing based on the requesting user's ID or username.
 *
 * The returned evaluator supports routing rules using the `user` field, allowing exact or inclusion-based matches on user IDs or usernames. It provides methods to check if evaluation is possible for a given context, to evaluate routing rules for the current user, and to test if a user-based condition matches the context.
 *
 * @returns A {@link RoutingEvaluator} configured for user-based routing decisions.
 */
export default function createUserEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata with only one clean field name
  const supportedFields: FieldInfo[] = [
    {
      name: 'user',
      description: 'The user requesting the content (by ID or username)',
      valueTypes: ['string', 'number', 'string[]', 'number[]'],
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

      // Find matching rules based on user criteria - only check 'user' field
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.user) {
          return false
        }

        const usersValue = rule.criteria.user
        const usersArray = Array.isArray(usersValue) ? usersValue : [usersValue]

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
        priority: rule.order || 50, // Default to 50 if not specified
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      // Handle ConditionGroup object - defer to ContentRouterService
      if (!('field' in condition)) {
        return false
      }

      // Only support the 'user' field
      if (condition.field !== 'user') {
        return false
      }

      // Skip if no user information available
      if (!context.userId && !context.userName) {
        return false
      }

      const { operator, value } = condition
      let matched = false

      if (operator === 'equals') {
        // Check user ID
        if (
          context.userId &&
          (value === context.userId || value === context.userId.toString())
        ) {
          matched = true
        }
        // Check username
        else if (context.userName && value === context.userName) {
          matched = true
        }
      } else if (operator === 'in') {
        const users = Array.isArray(value) ? value : [value]

        // Check user ID
        if (context.userId) {
          const userIdStr = context.userId.toString()
          if (users.includes(context.userId) || users.includes(userIdStr)) {
            matched = true
          }
        }
        // Check username
        else if (context.userName && users.includes(context.userName)) {
          matched = true
        }
      }

      // Apply negation if needed
      return condition.negate ? !matched : matched
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'user' field
      return field === 'user'
    },
  }
}
