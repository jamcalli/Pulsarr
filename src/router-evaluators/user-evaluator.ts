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
  type RouterRule,
} from '@root/types/router.types.js'

/**
 * Creates a routing evaluator that determines routing decisions based on the requesting user's ID or username.
 *
 * The evaluator supports user-based routing rules using the `user` field, allowing for exact matches, inclusion/exclusion lists, and regular expression matching on usernames or IDs. It provides methods to check if evaluation is possible for a given context, to evaluate routing rules for the current user, and to test if a user-based condition matches the context.
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
   * Checks if the provided value exactly matches the user's ID or username.
   *
   * @param userId - The user's numeric ID, or undefined if not available.
   * @param userName - The user's username, or undefined if not available.
   * @param value - The value to compare against the user ID or username.
   * @returns True if {@link value} is equal to the user ID (as a number or string) or the username; otherwise, false.
   */
  function userMatchesExact(
    userId: number | undefined,
    userName: string | undefined,
    value: unknown,
  ): boolean {
    const val =
      typeof value === 'string' ? value.toLowerCase() : value?.toString()

    if (userId && val !== undefined) {
      // Compare string representations since val is already converted to string
      if (val === userId.toString()) {
        return true
      }
    }

    if (userName && typeof val === 'string') {
      return userName.toLowerCase() === val
    }

    return false
  }

  /**
   * Checks if the specified user ID or username exists within a list of values.
   *
   * Returns `true` if either the user ID (as a number or string) or the username matches any entry in the provided {@link values} array; otherwise, returns `false`.
   *
   * @param userId - The user's numeric ID, or undefined if not available.
   * @param userName - The user's username, or undefined if not available.
   * @param values - An array of values to check, which may include strings and numbers.
   * @returns `true` if a match is found; otherwise, `false`.
   */
  function userInList(
    userId: number | undefined,
    userName: string | undefined,
    values: unknown[],
  ): boolean {
    const normalised = values.map((v) =>
      typeof v === 'string' ? v.toLowerCase() : v?.toString(),
    )

    if (userId) {
      const userIdStr = userId.toString()
      if (normalised.includes(userIdStr)) {
        return true
      }
    }

    // Check if context.userName matches any user in the list
    if (userName && normalised.includes(userName.toLowerCase())) {
      return true
    }

    return false
  }

  /**
   * Checks if a username matches a given regular expression pattern.
   *
   * @param userName - The username to test.
   * @param pattern - The regular expression pattern to match against.
   * @returns `true` if the username matches the pattern; otherwise, `false`.
   *
   * @remark Returns `false` if the username is undefined, the pattern is not a string, or the pattern is an invalid regular expression.
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

      let rules: RouterRule[] = []
      try {
        rules = await fastify.db.getRouterRulesByType('user')
      } catch (err) {
        fastify.log.error({ err }, 'User evaluator - DB query failed')
        return null
      }

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
        tags: rule.tags || [],
        priority: rule.order || 50, // Default to 50 if not specified
        searchOnAdd: rule.search_on_add,
        seasonMonitoring: rule.season_monitoring,
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

      // Do not apply negation here - the content router service handles negation at a higher level.
      // This prevents double-negation issues when condition.negate is true.
      return result
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'user' field
      return field === 'user'
    },
  }
}
