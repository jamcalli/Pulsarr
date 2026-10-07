import {
  fieldAllowsOperator,
  isRouterField,
} from '@root/schemas/content-router/router-fields.js'
import type {
  Condition,
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
