import type {
  Condition,
  ConditionGroup,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RouterRule,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'

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
 * Creates a routing evaluator that determines routing decisions for content items based on conditional rules.
 *
 * The evaluator receives pre-filtered conditional routing rules from the ContentRouterService, validates their condition structures, and evaluates each rule against the provided content item and routing context by delegating field-specific evaluations to specialized evaluators. For each rule whose condition matches, a routing decision is generated, including the target instance, quality profile, root folder, tags, priority, search-on-add, season monitoring, and series type.
 *
 * @returns A {@link RoutingEvaluator} that processes conditional routing rules with the highest priority.
 *
 * @remark The evaluator operates on pre-filtered rules supplied by the content router and delegates condition evaluation to field-specific evaluators via fastify.contentRouter.evaluateCondition.
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
    ruleType: 'conditional',
    supportedFields,
    supportedOperators,

    async canEvaluate(
      _item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      // Always return true - let evaluate() handle rule checking with passed-in rules
      // Content-router will filter rules by type before calling evaluate()
      return true
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
      rules: RouterRule[],
    ): Promise<RoutingDecision[] | null> {
      // Rules are already filtered by content-router (by type, target_type, and enabled status)
      if (rules.length === 0) {
        return null
      }

      const matchingRules: RouterRule[] = []

      for (const rule of rules) {
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
        ruleName: rule.name,
      }))
    },
  }
}
