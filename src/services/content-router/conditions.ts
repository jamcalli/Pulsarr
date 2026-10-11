import {
  fieldAllowsOperator,
  isRouterField,
} from '@root/schemas/content-router/router-fields.js'
import type {
  Condition,
  ConditionGroup,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import type { FastifyBaseLogger } from 'fastify'
import { FIELD_EVALUATORS } from './evaluators/registry.js'

const UNEVALUATED: null = null

export function evaluateLeaf(
  condition: Condition,
  item: ContentItem,
  context: RoutingContext,
  log: FastifyBaseLogger,
): boolean | null {
  const { field, operator, value } = condition
  if (!isRouterField(field)) {
    log.warn({ field }, `No evaluator can handle condition field "${field}"`)
    return UNEVALUATED
  }
  if (!fieldAllowsOperator(field, operator)) {
    return UNEVALUATED
  }
  try {
    return FIELD_EVALUATORS[field].evaluate(operator, value, item, context, log)
  } catch (error) {
    log.error({ error, field }, 'Condition evaluation failed')
    return UNEVALUATED
  }
}

export function evaluateCondition(
  condition: Condition | ConditionGroup,
  item: ContentItem,
  context: RoutingContext,
  log: FastifyBaseLogger,
): boolean {
  return resolveCondition(condition, item, context, log) ?? false
}

function resolveCondition(
  condition: Condition | ConditionGroup,
  item: ContentItem,
  context: RoutingContext,
  log: FastifyBaseLogger,
): boolean | null {
  const result =
    'conditions' in condition
      ? evaluateGroup(condition, item, context, log)
      : evaluateLeaf(condition, item, context, log)
  if (result === null) return null
  return condition.negate ? !result : result
}

function evaluateGroup(
  group: ConditionGroup,
  item: ContentItem,
  context: RoutingContext,
  log: FastifyBaseLogger,
): boolean | null {
  if (!group.conditions || group.conditions.length === 0) {
    return null
  }

  const deciding = group.operator !== 'AND'
  let sawNull = false
  for (const condition of group.conditions) {
    const result = resolveCondition(condition, item, context, log)
    if (result === deciding) return deciding
    if (result === null) sawNull = true
  }
  return sawNull ? null : !deciding
}
