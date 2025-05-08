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
 * Determines whether the given value is a valid {@link Condition} object.
 *
 * Returns true if the value is a non-null object containing `field`, `operator`, and `value` properties.
 */
function isCondition(value: unknown): value is Condition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'field' in value &&
    'operator' in value &&
    'value' in value
  )
}

/**
 * Determines whether the given value is a valid condition group.
 *
 * Returns true if the value is a non-null object containing an 'operator' property and a 'conditions' array.
 */
function isConditionGroup(value: unknown): value is ConditionGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operator' in value &&
    'conditions' in value &&
    Array.isArray((value as ConditionGroup).conditions)
  )
}

/**
 * Determines whether the given value is a valid {@link Condition} or {@link ConditionGroup}.
 *
 * @returns True if the value is a {@link Condition} or {@link ConditionGroup}; otherwise, false.
 */
function isValidCondition(value: unknown): value is Condition | ConditionGroup {
  return isCondition(value) || isConditionGroup(value)
}

/**
 * Creates a routing evaluator that applies complex conditional rules to determine routing decisions for content items.
 *
 * The evaluator retrieves enabled conditional routing rules from the database, validates their condition structures, and evaluates each rule against the provided content item and routing context. Matching rules generate routing decisions specifying the target instance, quality profile, root folder, tags, and priority.
 *
 * @returns A {@link RoutingEvaluator} configured to process conditional routing rules with the highest priority.
 */
export default function createConditionalEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata about the supported fields and operators
  const supportedFields: FieldInfo[] = [
    {
      name: 'condition',
      description: 'Complex condition structure for advanced routing',
      valueTypes: ['object'],
    },
  ]

  // Define a separate type for logical operators
  const supportedOperators: Record<string, OperatorInfo[]> = {
    condition: [
      {
        name: 'equals',
        description: 'Condition structure matches exactly',
        valueTypes: ['object'],
      },
      {
        name: 'contains',
        description: 'Condition structure contains the specified rules',
        valueTypes: ['object'],
      },
    ],
  }

  return {
    name: 'Conditional Router',
    description: 'Routes content based on complex conditional rules',
    priority: 100, // Highest priority - evaluate conditional rules first
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      const isMovie = context.contentType === 'movie'
      
      let rules
      try {
        rules = await fastify.db.getRouterRulesByType('conditional')
      } catch (err) {
        fastify.log.error({ err }, 'Conditional evaluator (canEvaluate) - DB query failed')
        return false
      }

      const contentTypeRules = rules.filter(
        (rule) =>
          rule.enabled !== false &&
          rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      return contentTypeRules.length > 0
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      const isMovie = context.contentType === 'movie'
      
      let rules
      try {
        rules = await fastify.db.getRouterRulesByType('conditional')
      } catch (err) {
        fastify.log.error({ err }, 'Conditional evaluator (evaluate) - DB query failed')
        return null
      }

      const contentTypeRules = rules.filter(
        (rule) =>
          rule.target_type === (isMovie ? 'radarr' : 'sonarr') &&
          rule.enabled !== false,
      )

      if (contentTypeRules.length === 0) {
        return null
      }

      const matchingRules = []

      for (const rule of contentTypeRules) {
        if (!rule.criteria || typeof rule.criteria.condition === 'undefined') {
          continue
        }

        const condition = rule.criteria.condition
        if (!isValidCondition(condition)) {
          fastify.log.warn(`Invalid condition structure in rule "${rule.name}"`)
          continue
        }

        try {
          const isMatch = fastify.contentRouter.evaluateCondition(
            condition,
            item,
            context,
          )

          if (isMatch) {
            fastify.log.debug(
              `Conditional rule "${rule.name}" matched for item "${item.title}"`,
            )
            matchingRules.push(rule)
          }
        } catch (error) {
          fastify.log.error(
            `Error evaluating conditional rule "${rule.name}": ${error}`,
          )
        }
      }

      if (matchingRules.length === 0) {
        return null
      }

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
  }
}
