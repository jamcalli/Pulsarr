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
 * The evaluator supports routing rules using the `user` field, allowing exact matches, inclusion/exclusion lists, and regex matching on usernames or IDs. It provides methods to check if evaluation is possible for a given context, to evaluate routing rules for the current user, and to test if a user-based condition matches the context.
 *
 * @returns A {@link RoutingEvaluator} configured for user-based routing decisions.
 *
 * @remark If neither `userId` nor `userName` is present in the routing context, evaluation is skipped and no routing decisions are returned.
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

  /**
   * Determines whether the given user ID or username exactly matches the specified value.
   *
   * @param userId - The user's numeric ID, or undefined if not available.
   * @param userName - The user's username, or undefined if not available.
   * @param value - The value to compare against the user ID or username.
   * @returns True if {@link value} matches the user ID (as a number or string) or username; otherwise, false.
   */
  function userMatchesExact(
    userId: number | undefined,
    userName: string | undefined,
    value: unknown,
  ): boolean {
    if (userId && (value === userId || value === userId.toString())) {
      return true
    }
    if (userName && value === userName) {
      return true
    }
    return false
  }

  /**
   * Determines whether the given user ID or username is present in a list of values.
   *
   * @param userId - The user's numeric ID, or undefined if not available.
   * @param userName - The user's username, or undefined if not available.
   * @param values - The list of values to check against, which may contain strings or numbers.
   * @returns `true` if the user ID (as a number or string) or username is found in {@link values}; otherwise, `false`.
   */
  function userInList(
    userId: number | undefined,
    userName: string | undefined,
    values: unknown[],
  ): boolean {
    // Check if context.userId matches any user in the list
    if (userId) {
      const userIdStr = userId.toString()
      if (values.includes(userIdStr) || values.includes(userId)) {
        return true
      }
    }

    // Check if context.userName matches any user in the list
    if (userName && values.includes(userName)) {
      return true
    }

    return false
  }

  /**
   * Determines whether the given username matches the specified regular expression pattern.
   *
   * @param userName - The username to test.
   * @param pattern - The regular expression pattern to match against.
   * @returns `true` if {@link userName} matches the {@link pattern}; otherwise, `false`.
   *
   * @remark Returns `false` if {@link userName} is undefined, if {@link pattern} is not a string, or if the pattern is invalid.
   */
  function userMatchesRegex(
    userName: string | undefined,
    pattern: string,
  ): boolean {
    if (typeof pattern !== 'string' || !userName) {
      return false
    }

    try {
      const regex = new RegExp(pattern)
      return regex.test(userName)
    } catch (error) {
      fastify.log.error(`Invalid regex pattern: ${pattern}`, error)
      return false
    }
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
          case 'equals':
            return userMatchesExact(
              context.userId,
              context.userName,
              usersValue,
            )

          case 'notEquals':
            return !userMatchesExact(
              context.userId,
              context.userName,
              usersValue,
            )

          case 'in':
          case 'notIn': {
            const usersArray = Array.isArray(usersValue)
              ? usersValue
              : [usersValue]
            const userMatched = userInList(
              context.userId,
              context.userName,
              usersArray,
            )
            return operator === 'in' ? userMatched : !userMatched
          }

          case 'regex':
            return userMatchesRegex(context.userName, usersValue as string)

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
        case 'equals':
          result = userMatchesExact(context.userId, context.userName, value)
          break

        case 'notEquals':
          result = !userMatchesExact(context.userId, context.userName, value)
          break

        case 'in': {
          const users = Array.isArray(value) ? value : [value]
          result = userInList(context.userId, context.userName, users)
          break
        }

        case 'notIn': {
          const excludeUsers = Array.isArray(value) ? value : [value]
          result = !userInList(context.userId, context.userName, excludeUsers)
          break
        }

        case 'regex':
          result = userMatchesRegex(context.userName, value as string)
          break
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
