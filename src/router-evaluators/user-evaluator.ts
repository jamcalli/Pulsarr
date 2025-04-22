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
        name: 'notEquals',
        description: 'User does not match (by ID or username)',
        valueTypes: ['string', 'number'],
      },
      {
        name: 'in',
        description: 'User is one of the provided values',
        valueTypes: ['string[]', 'number[]'],
        valueFormat:
          'Array of user IDs or usernames, e.g. ["admin", "john", 42]',
      },
      {
        name: 'notIn',
        description: 'User is not one of the provided values',
        valueTypes: ['string[]', 'number[]'],
        valueFormat:
          'Array of user IDs or usernames to exclude, e.g. ["guest", 100]',
      },
      {
        name: 'regex',
        description: 'Username matches the regular expression',
        valueTypes: ['string'],
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

      // Filter to only rules for the current content type and enabled
      const contentTypeRules = rules.filter(
        (rule) =>
          rule.target_type === (isMovie ? 'radarr' : 'sonarr') &&
          rule.enabled !== false,
      )

      // Find matching rules based on user criteria - only check 'user' field
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.user) {
          return false
        }

        const usersValue = rule.criteria.user
        const operator = rule.criteria.operator || 'equals'

        // Handle different operator types
        switch (operator) {
          case 'equals': {
            // Check user ID
            if (
              context.userId &&
              (usersValue === context.userId ||
                usersValue === context.userId.toString())
            ) {
              return true
            }
            // Check username - removed 'else' since previous condition has early return
            if (context.userName && usersValue === context.userName) {
              return true
            }
            return false
          }

          case 'notEquals': {
            // Check user ID
            if (
              context.userId &&
              (usersValue === context.userId ||
                usersValue === context.userId.toString())
            ) {
              return false
            }
            // Check username - removed 'else' since previous condition has early return
            if (context.userName && usersValue === context.userName) {
              return false
            }
            return true
          }

          case 'in': {
            const usersArray = Array.isArray(usersValue)
              ? usersValue
              : [usersValue]
            let userMatched = false

            // Check if context.userId matches any user in the list
            if (context.userId) {
              const userIdStr = context.userId.toString()
              if (
                usersArray.includes(userIdStr) ||
                usersArray.includes(context.userId)
              ) {
                userMatched = true
              }
            }

            // Check if context.userName matches any user in the list
            if (!userMatched && context.userName) {
              if (usersArray.includes(context.userName)) {
                userMatched = true
              }
            }

            // For 'in' we want it to match, for 'notIn' we want it not to match
            return operator === 'in' ? userMatched : !userMatched
          }

          case 'notIn': {
            const usersArray = Array.isArray(usersValue)
              ? usersValue
              : [usersValue]
            let userMatched = false

            // Check if context.userId matches any user in the list
            if (context.userId) {
              const userIdStr = context.userId.toString()
              if (
                usersArray.includes(userIdStr) ||
                usersArray.includes(context.userId)
              ) {
                userMatched = true
              }
            }

            // Check if context.userName matches any user in the list
            if (!userMatched && context.userName) {
              if (usersArray.includes(context.userName)) {
                userMatched = true
              }
            }

            // For 'notIn' we want it not to match
            return !userMatched
          }

          case 'regex': {
            if (typeof usersValue === 'string' && context.userName) {
              try {
                const regex = new RegExp(usersValue)
                return regex.test(context.userName)
              } catch (error) {
                fastify.log.error(`Invalid regex in user rule: ${error}`)
                return false
              }
            }
            return false
          }

          default:
            return false
        }
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

      const { operator, value, negate = false } = condition
      let result = false

      switch (operator) {
        case 'equals': {
          // Check user ID
          if (
            context.userId &&
            (value === context.userId || value === context.userId.toString())
          ) {
            result = true
          }
          // Check username - removed 'else' since it's unnecessary
          if (context.userName && value === context.userName) {
            result = true
          }
          break
        }

        case 'notEquals': {
          // Check user ID
          if (
            context.userId &&
            (value === context.userId || value === context.userId.toString())
          ) {
            result = false
          }
          // Check username - removed 'else' since it's unnecessary
          if (context.userName && value === context.userName) {
            result = false
          } else {
            result = true
          }
          break
        }

        case 'in': {
          const users = Array.isArray(value) ? value : [value]
          // Check user ID
          if (context.userId) {
            const userIdStr = context.userId.toString()
            if (users.includes(context.userId) || users.includes(userIdStr)) {
              result = true
            }
          }
          // Check username - removed 'else' since it's unnecessary
          if (context.userName && users.includes(context.userName)) {
            result = true
          }
          break
        }

        case 'notIn': {
          const excludeUsers = Array.isArray(value) ? value : [value]
          // Check user ID is not in the list
          if (context.userId) {
            const userIdStr = context.userId.toString()
            if (
              !(
                excludeUsers.includes(context.userId) ||
                excludeUsers.includes(userIdStr)
              )
            ) {
              result = true
            }
          }
          // Check username is not in the list - removed 'else' since it's unnecessary
          if (context.userName && !excludeUsers.includes(context.userName)) {
            result = true
          }
          break
        }

        case 'regex': {
          if (typeof value === 'string' && context.userName) {
            try {
              const regex = new RegExp(value)
              result = regex.test(context.userName)
            } catch (error) {
              fastify.log.error(`Invalid regex in user condition: ${error}`)
            }
          }
          break
        }
      }

      // Apply negation if needed
      return negate ? !result : result
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'user' field
      return field === 'user'
    },
  }
}
