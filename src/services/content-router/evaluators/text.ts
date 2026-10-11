import type { ComparisonOperator } from '@root/schemas/content-router/content-router.schema.js'
import {
  evaluateRegexSafely,
  evaluateRegexSafelyMultiple,
} from '@utils/regex-safety.js'
import { isString, isStringArray } from '@utils/type-guards.js'
import type { FastifyBaseLogger } from 'fastify'
import type { RouterIdentity } from './define-field.js'

export type Fold = (value: string) => string

export const foldLower: Fold = (value) => value.toLowerCase()
export const foldUpper: Fold = (value) => value.toUpperCase()
export const foldTrimLower: Fold = (value) => value.toLowerCase().trim()

/** Safe regex over one or many subjects in their original case, null on an unsafe or invalid pattern. */
export function matchesRegex(
  pattern: unknown,
  subjects: string | readonly string[],
  log: FastifyBaseLogger,
  label: string,
): boolean | null {
  if (!isString(pattern)) return false
  return isString(subjects)
    ? evaluateRegexSafely(pattern, subjects, log, label)
    : evaluateRegexSafelyMultiple(pattern, subjects, log, label)
}

export function compareText(
  actual: string,
  operator: ComparisonOperator,
  value: unknown,
  fold: Fold,
  log: FastifyBaseLogger,
  label: string,
): boolean | null {
  const folded = fold(actual)
  const isMember = (candidates: readonly unknown[]) =>
    candidates.some(
      (candidate) => isString(candidate) && folded === fold(candidate),
    )

  switch (operator) {
    case 'equals':
      return isString(value) && folded === fold(value)
    case 'notEquals':
      return isString(value) && folded !== fold(value)
    case 'contains':
      return isString(value) && folded.includes(fold(value))
    case 'notContains':
      return isString(value) && !folded.includes(fold(value))
    case 'in':
      return Array.isArray(value) && isMember(value)
    case 'notIn':
      return Array.isArray(value) && !isMember(value)
    case 'regex':
      return matchesRegex(value, actual, log, label)
    default:
      return false
  }
}

export function compareEnum(
  actual: string,
  operator: ComparisonOperator,
  value: unknown,
): boolean {
  const folded = foldLower(actual)

  switch (operator) {
    case 'equals':
      return isString(value) && folded === foldLower(value)
    case 'notEquals':
      return isString(value) && folded !== foldLower(value)
    case 'in':
      return (
        isStringArray(value) &&
        value.some((candidate) => folded === foldLower(candidate))
      )
    case 'notIn':
      return (
        isStringArray(value) &&
        !value.some((candidate) => folded === foldLower(candidate))
      )
    default:
      return false
  }
}

export function compareTextSet(
  actuals: readonly string[],
  operator: ComparisonOperator,
  value: unknown,
  log: FastifyBaseLogger,
  label: string,
): boolean | null {
  const folded = new Set(actuals.map(foldTrimLower))
  const hasAny = (candidates: readonly string[]) =>
    candidates.some((candidate) => folded.has(foldTrimLower(candidate)))

  switch (operator) {
    case 'contains':
    case 'in':
      if (isStringArray(value)) return hasAny(value)
      return isString(value) && folded.has(foldTrimLower(value))
    case 'notContains':
    case 'notIn':
      if (isStringArray(value)) return !hasAny(value)
      return isString(value) && !folded.has(foldTrimLower(value))
    case 'equals': {
      if (isStringArray(value)) {
        const expected = new Set(value.map(foldTrimLower))
        return (
          expected.size === folded.size &&
          [...expected].every((candidate) => folded.has(candidate))
        )
      }
      return (
        isString(value) && folded.size === 1 && folded.has(foldTrimLower(value))
      )
    }
    case 'regex':
      return matchesRegex(value, actuals, log, label)
    default:
      return false
  }
}

function identityToken(value: unknown): string | undefined {
  return isString(value) ? foldLower(value) : value?.toString()
}

function identityMatches(identity: RouterIdentity, value: unknown): boolean {
  const token = identityToken(value)
  if (identity.userId && token !== undefined) {
    if (token === identity.userId.toString()) return true
  }
  if (identity.userName && isString(token)) {
    return foldLower(identity.userName) === token
  }
  return false
}

function identityInList(
  identity: RouterIdentity,
  values: readonly unknown[],
): boolean {
  const tokens = values.map(identityToken)
  if (identity.userId && tokens.includes(identity.userId.toString())) {
    return true
  }
  return Boolean(
    identity.userName && tokens.includes(foldLower(identity.userName)),
  )
}

export function compareIdentity(
  actual: RouterIdentity,
  operator: ComparisonOperator,
  value: unknown,
  log: FastifyBaseLogger,
  label: string,
): boolean | null {
  switch (operator) {
    case 'equals':
      return Array.isArray(value)
        ? identityInList(actual, value)
        : identityMatches(actual, value)
    case 'notEquals':
      return Array.isArray(value)
        ? !identityInList(actual, value)
        : !identityMatches(actual, value)
    case 'in':
      return identityInList(actual, Array.isArray(value) ? value : [value])
    case 'notIn':
      return !identityInList(actual, Array.isArray(value) ? value : [value])
    case 'regex': {
      const { userName } = actual
      return userName ? matchesRegex(value, userName, log, label) : false
    }
    default:
      return false
  }
}
