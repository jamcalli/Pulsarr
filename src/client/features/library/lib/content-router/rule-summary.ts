import {
  type ConditionOperator,
  fieldLabel,
  numberRange,
  unitSymbol,
  VOTE_FIELDS,
} from '@/features/library/lib/content-router/condition-fields'
import {
  type ConditionNode,
  childrenOf,
  type GroupNode,
  ROOT_ID,
  type RuleNode,
} from '@/features/library/lib/content-router/condition-tree'
import {
  formatCount,
  formatList,
  formatNumber,
  formatUngrouped,
} from '@/lib/format'

export type ValueLabel = (field: string, value: string) => string

const PHRASES: Record<ConditionOperator, readonly [string, string]> = {
  equals: ['is', 'is not'],
  notEquals: ['is not', 'is'],
  contains: ['contains', 'does not contain'],
  notContains: ['does not contain', 'contains'],
  in: ['is any of', 'is none of'],
  notIn: ['is none of', 'is any of'],
  greaterThan: ['is above', 'is not above'],
  lessThan: ['is below', 'is not below'],
  between: ['is', 'is not'],
  regex: ['matches', 'does not match'],
}

export const EMPTY_SUMMARY = 'No conditions yet'

function numberText(field: string, value: number): string {
  const text = numberRange(field).grouping
    ? formatNumber(value)
    : formatUngrouped(value)
  return `${text}${unitSymbol(field) ?? ''}`
}

function valueText(node: ConditionNode, label: ValueLabel): string | null {
  const { field, value } = node
  if (Array.isArray(value)) {
    return value.length
      ? formatList(value.map((item) => label(field, item)))
      : null
  }
  if (typeof value === 'number') return numberText(field, value)
  if (typeof value === 'string') {
    return value.trim() === '' ? null : label(field, value)
  }
  if (value == null) return null
  const { min, max } = value
  if (min !== undefined && max !== undefined) {
    return `${numberText(field, min)} to ${numberText(field, max)}`
  }
  if (min !== undefined) return `at least ${numberText(field, min)}`
  if (max !== undefined) return `at most ${numberText(field, max)}`
  return null
}

export type SummaryTokenKind =
  | 'field'
  | 'operator'
  | 'value'
  | 'join'
  | 'not'
  | 'paren'

export interface SummaryToken {
  kind: SummaryTokenKind
  text: string
}

const token = (kind: SummaryTokenKind, text: string): SummaryToken => ({
  kind,
  text,
})

function conditionTokens(
  node: ConditionNode,
  label: ValueLabel,
): SummaryToken[] {
  const votes =
    VOTE_FIELDS.has(node.field) && node.votes !== undefined
      ? [
          token('operator', 'with at least'),
          token('value', formatCount(node.votes, 'vote')),
        ]
      : []
  const value = valueText(node, label)
  if (value === null && votes.length === 0) return []
  const [positive, negative] = PHRASES[node.operator]
  const phrase =
    value === null
      ? []
      : [
          token('operator', node.negate ? negative : positive),
          token('value', value),
        ]
  return [token('field', fieldLabel(node.field)), ...phrase, ...votes]
}

function groupTokens(
  parts: SummaryToken[][],
  operator: GroupNode['operator'],
  negate: boolean,
): SummaryToken[] {
  const body = joined(parts, operator)
  const grouped = parts.length > 1 ? wrapped(body) : body
  return negate ? [token('not', 'not'), ...grouped] : grouped
}

function wrapped(body: SummaryToken[]): SummaryToken[] {
  return [token('paren', '('), ...body, token('paren', ')')]
}

function joined(
  parts: SummaryToken[][],
  operator: GroupNode['operator'],
): SummaryToken[] {
  const join = operator === 'AND' ? 'and' : 'or'
  return parts.flatMap((part, index) =>
    index === 0 ? part : [token('join', join), ...part],
  )
}

function groupParts(
  nodes: readonly RuleNode[],
  groupId: string,
  label: ValueLabel,
): SummaryToken[][] {
  return childrenOf(nodes, groupId).flatMap((child) => {
    if (child.kind === 'condition') {
      const tokens = conditionTokens(child, label)
      return tokens.length ? [tokens] : []
    }
    const inner = groupParts(nodes, child.id, label)
    return inner.length
      ? [groupTokens(inner, child.operator, child.negate)]
      : []
  })
}

/** A rule's conditions as typed tokens, empty when no condition is filled in yet. */
export function ruleTokens(
  nodes: readonly RuleNode[],
  label: ValueLabel,
): SummaryToken[] {
  const root = nodes.find((node) => node.id === ROOT_ID)
  if (root?.kind !== 'group') return []
  const parts = groupParts(nodes, ROOT_ID, label)
  if (parts.length === 0) return []
  return root.negate
    ? groupTokens(parts, root.operator, true)
    : joined(parts, root.operator)
}

/** The plain sentence the tokens read as, for assistive tech. */
export function tokensSentence(tokens: readonly SummaryToken[]): string {
  if (tokens.length === 0) return EMPTY_SUMMARY
  const text = tokens.reduce((sentence, { kind, text: part }, index) => {
    const glued =
      index === 0 ||
      (kind === 'paren' && part === ')') ||
      (tokens[index - 1].kind === 'paren' && tokens[index - 1].text === '(')
    return glued ? sentence + part : `${sentence} ${part}`
  }, '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
