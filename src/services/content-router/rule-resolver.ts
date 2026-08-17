import type {
  Condition,
  ConditionGroup,
  ContentItem,
  RouterRule,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import type { FastifyBaseLogger } from 'fastify'

export interface RuleEvaluationResult {
  decisions: RoutingDecision[]
  skipReason?: 'excluded'
}

type ConditionMatcher = (
  condition: Condition | ConditionGroup,
  item: ContentItem,
  context: RoutingContext,
) => boolean

function isCondition(value: unknown): value is Condition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'field' in value &&
    'operator' in value &&
    'value' in value
  )
}

function isConditionGroup(value: unknown): value is ConditionGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operator' in value &&
    'conditions' in value &&
    Array.isArray((value as ConditionGroup).conditions)
  )
}

function isValidCondition(value: unknown): value is Condition | ConditionGroup {
  return isCondition(value) || isConditionGroup(value)
}

/**
 * Resolves router rules into routing decisions for a content item.
 *
 * Exclude rules run first: a single match is an absolute veto, regardless of
 * what any other rule (higher or lower priority) matches, and short-circuits
 * before any decision work. Each rule is evaluated at most once.
 *
 * Approval, quota and watchlist gates stay outside this function - callers
 * apply them to the returned decisions.
 */
export function evaluateRules(
  log: FastifyBaseLogger,
  rules: RouterRule[],
  item: ContentItem,
  context: RoutingContext,
  matchCondition: ConditionMatcher,
): RuleEvaluationResult {
  const targetType = context.contentType === 'movie' ? 'radarr' : 'sonarr'

  const applicableRules = rules.filter(
    (rule) => rule.enabled && rule.target_type === targetType,
  )

  const matches = (rule: RouterRule): boolean => {
    const condition = rule.criteria?.condition
    if (!isValidCondition(condition)) {
      log.warn(
        { ruleId: rule.id, ruleName: rule.name },
        'Router rule has a missing or malformed condition - skipping',
      )
      return false
    }
    try {
      return matchCondition(condition, item, context)
    } catch (error) {
      log.error(
        { error, ruleId: rule.id, ruleName: rule.name },
        `Error evaluating router rule for "${item.title}"`,
      )
      return false
    }
  }

  for (const rule of applicableRules) {
    if (!rule.exclude_from_routing) continue
    if (matches(rule)) {
      log.info(`"${item.title}" excluded from routing by rule "${rule.name}"`)
      return { decisions: [], skipReason: 'excluded' }
    }
  }

  const decisions: RoutingDecision[] = []
  for (const rule of applicableRules) {
    if (rule.exclude_from_routing) continue
    // A RoutingDecision always requires a real target instance. The API
    // rejects this combination, so only legacy rows can hit it
    const instanceId = rule.target_instance_id
    if (instanceId == null) {
      log.warn(
        { ruleId: rule.id, ruleName: rule.name },
        'Router rule has no target instance and does not exclude - skipping',
      )
      continue
    }
    if (!matches(rule)) continue

    decisions.push({
      instanceId,
      qualityProfile: rule.quality_profile,
      rootFolder: rule.root_folder,
      tags: rule.tags || [],
      priority: rule.order ?? 50,
      searchOnAdd: rule.search_on_add,
      seasonMonitoring: rule.season_monitoring,
      seriesType: rule.series_type,
      monitor: rule.monitor,
      ruleId: rule.id,
      ruleName: rule.name,
    })
  }

  return { decisions }
}
