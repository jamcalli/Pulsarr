import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'

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
          if (usersArray.includes(userIdStr)) {
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
        weight: rule.order,
      }))
    },
  }
}
