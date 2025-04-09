import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
  UserCriteria,
} from '@root/types/router.types.js'

/**
 * Determines whether the given value conforms to the UserCriteria structure.
 *
 * This type guard validates that the input is a non-null object containing at least one of the
 * properties `ids` or `names`. If the `ids` property is present, it must be either a number or an array
 * of numbers. Similarly, if the `names` property is present, it must be a string or an array of strings.
 *
 * @param value - The value to validate as a UserCriteria.
 * @returns True if the value satisfies the UserCriteria structure, false otherwise.
 */
function isUserCriteria(value: unknown): value is UserCriteria {
  if (!value || typeof value !== 'object') return false
  const criteria = value as UserCriteria
  return (
    ('ids' in criteria || 'names' in criteria) &&
    (!('ids' in criteria) ||
      typeof criteria.ids === 'number' ||
      (Array.isArray(criteria.ids) &&
        criteria.ids.every((id) => typeof id === 'number'))) &&
    (!('names' in criteria) ||
      typeof criteria.names === 'string' ||
      (Array.isArray(criteria.names) &&
        criteria.names.every((name) => typeof name === 'string')))
  )
}

/**
 * Creates a router plugin for user-based content routing.
 *
 * The returned plugin provides metadata and an asynchronous `evaluateRouting` method that computes routing
 * decisions based on user-specific criteria. The `evaluateRouting` method:
 * - Returns null if neither a user ID nor a username is provided in the context.
 * - Retrieves user routing rules from the database and filters them by content type (using "radarr" for movies and "sonarr" for other content).
 * - Evaluates and matches rules based on the provided user ID or username against the defined criteria.
 * - Maps any matching rules into routing decisions containing instance ID, quality profile, root folder, and weight.
 *
 * @returns A router plugin configured for user-based routing.
 */
export default function createUserRouterPlugin(
  fastify: FastifyInstance,
): RouterPlugin {
  return {
    name: 'User Router',
    description: 'Routes content based on requesting users',
    enabled: true,
    order: 50,

    async evaluateRouting(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      // Skip if no user information available
      if (!context.userId && !context.userName) {
        return null
      }

      // Get the appropriate type of rules
      const isMovie = context.contentType === 'movie'
      const rules = await fastify.db.getRouterRulesByType('user')

      // Filter to only rules for the current content type
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // Find matching rules based on user criteria
      const matchingRules = contentTypeRules.filter((rule) => {
        const userCriteria = rule.criteria.users

        if (!isUserCriteria(userCriteria)) {
          return false
        }

        // Handle user IDs
        if (context.userId && userCriteria.ids) {
          const criteriaIds = Array.isArray(userCriteria.ids)
            ? userCriteria.ids
            : [userCriteria.ids]

          const contextIds = Array.isArray(context.userId)
            ? context.userId
            : [context.userId]

          return contextIds.some((id) => criteriaIds.includes(id))
        }

        // Handle usernames
        if (context.userName && userCriteria.names) {
          const criteriaNames = Array.isArray(userCriteria.names)
            ? userCriteria.names
            : [userCriteria.names]

          const contextNames = Array.isArray(context.userName)
            ? context.userName
            : [context.userName]

          return contextNames.some((name) => criteriaNames.includes(name))
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
        weight: rule.order,
      }))
    },
  }
}
