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
  RouterRule,
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
 * Checks if a value is a valid condition group for routing evaluation.
 *
 * Returns true if the value is a non-null object with an 'operator' property and a 'conditions' array.
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
 * Checks if a value is a valid condition or condition group for routing evaluation.
 *
 * @returns True if the value is a {@link Condition} or {@link ConditionGroup}; otherwise, false.
 */
function isValidCondition(value: unknown): value is Condition | ConditionGroup {
  return isCondition(value) || isConditionGroup(value)
}

/**
 * Creates a routing evaluator that determines routing decisions for content items based on conditional rules stored in the database.
 *
 * The evaluator fetches enabled conditional routing rules for the relevant content type, validates their condition structures, and evaluates each rule against the provided content item and routing context. For each rule whose condition matches, a routing decision is generated, including the target instance, quality profile, root folder, tags, priority, search-on-add, season monitoring, and series type.
 *
 * @returns A {@link RoutingEvaluator} that processes conditional routing rules with the highest priority.
 *
 * @remark If the database query fails, the evaluator logs an error and returns `false` from `canEvaluate` or `null` from `evaluate`.
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
      _item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      const isMovie = context.contentType === 'movie'

      let rules: RouterRule[] = []
      try {
        rules = await fastify.db.getRouterRulesByType('conditional')
      } catch (err) {
        fastify.log.error(
          {
            error: err,
            scope: 'conditional-evaluator',
            phase: 'canEvaluate',
            op: 'getRouterRulesByType',
            contentType: context.contentType,
          },
          'DB query failed',
        )
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

      let rules: RouterRule[] = []
      try {
        rules = await fastify.db.getRouterRulesByType('conditional')
      } catch (err) {
        fastify.log.error(
          {
            error: err,
            scope: 'conditional-evaluator',
            phase: 'evaluate',
            op: 'getRouterRulesByType',
            contentType: context.contentType,
          },
          'DB query failed',
        )
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

      const matchingRules: RouterRule[] = []

      for (const rule of contentTypeRules) {
        if (!rule.criteria || typeof rule.criteria.condition === 'undefined') {
          continue
        }

        const condition = rule.criteria.condition
        if (!isValidCondition(condition)) {
          fastify.log.warn(
            { scope: 'conditional-evaluator', ruleName: rule.name },
            'Invalid condition structure in conditional-routing rule',
          )
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
              {
                scope: 'conditional-evaluator',
                ruleName: rule.name,
                itemTitle: item.title,
                contentType: context.contentType,
              },
              'Conditional rule matched for item',
            )
            matchingRules.push(rule)
          }
        } catch (error) {
          fastify.log.error(
            {
              error,
              scope: 'conditional-evaluator',
              phase: 'evaluate',
              ruleName: rule.name,
            },
            'Error evaluating conditional rule',
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
        priority: rule.order ?? 50, // Default to 50 if undefined or null
        searchOnAdd: rule.search_on_add,
        seasonMonitoring: rule.season_monitoring,
        seriesType: rule.series_type,
      }))
    },
  }
}
