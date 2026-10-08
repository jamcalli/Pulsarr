import type { ComparisonOperator } from '@root/schemas/content-router/content-router.schema.js'
import type {
  FieldSpec,
  RouterValueKind,
} from '@root/schemas/content-router/router-fields.js'
import type { ContentItem, RoutingContext } from '@root/types/router.types.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  compareNumber,
  compareNumberSet,
  isNumericCriterion,
} from './numeric.js'
import {
  compareEnum,
  compareIdentity,
  compareText,
  compareTextSet,
  foldLower,
} from './text.js'

export interface RouterIdentity {
  userId: number | undefined
  userName: string | undefined
}

export interface KindValue {
  number: number | readonly number[]
  text: string
  textSet: readonly string[]
  enum: string
  identity: RouterIdentity
}

export interface CompareEnv {
  item: ContentItem
  log: FastifyBaseLogger
  label: string
}

export type Comparator<A> = (
  actual: A,
  operator: ComparisonOperator,
  value: unknown,
  env: CompareEnv,
) => boolean | null

export interface FieldImpl<A> {
  /** Undefined means the item has no data for this field. */
  extract: (item: ContentItem, context: RoutingContext) => A | undefined
  compare?: Comparator<A>
}

export interface BoundField {
  /** Null when the item has no data for the field or the condition cannot run on it. */
  evaluate(
    operator: ComparisonOperator,
    value: unknown,
    item: ContentItem,
    context: RoutingContext,
    log: FastifyBaseLogger,
  ): boolean | null
}

export const KIND_COMPARATORS: {
  [K in RouterValueKind]: Comparator<KindValue[K]>
} = {
  number: (actual, operator, value) => {
    if (!isNumericCriterion(value)) return false
    return typeof actual === 'number'
      ? compareNumber(actual, operator, value)
      : compareNumberSet(actual, operator, value)
  },
  text: (actual, operator, value, { log, label }) =>
    compareText(actual, operator, value, foldLower, log, label),
  textSet: (actual, operator, value, { log, label }) =>
    compareTextSet(actual, operator, value, log, label),
  enum: (actual, operator, value) => compareEnum(actual, operator, value),
  identity: (actual, operator, value, { log, label }) =>
    compareIdentity(actual, operator, value, log, label),
}

export function defineField<K extends RouterValueKind, A extends KindValue[K]>(
  spec: FieldSpec<K>,
  impl: FieldImpl<A>,
): BoundField {
  const compare: Comparator<A> = impl.compare ?? KIND_COMPARATORS[spec.kind]
  const label = `${spec.label.toLowerCase()} condition`
  return {
    evaluate(operator, value, item, context, log) {
      const actual = impl.extract(item, context)
      if (actual === undefined) return null
      return compare(actual, operator, value, { item, log, label })
    },
  }
}
