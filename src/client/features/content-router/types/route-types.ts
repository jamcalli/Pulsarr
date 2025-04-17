import type { ConditionValue } from '@/features/content-router/schemas/content-router.schema'

/**
 * Types for the conditional route query builder.
 * These types define the structure of conditions and condition groups
 * used in the content router's conditional evaluator.
 */

/**
 * Base interface for conditions and condition groups
 */
export interface ConditionBase {
  /** Whether to negate the condition (NOT) */
  negate?: boolean
}

/**
 * Represents a single condition in a query
 */
export interface Condition extends ConditionBase {
  /** The field to evaluate (genre, year, language, user, etc.) */
  field: string

  /** The operator to apply (equals, contains, in, etc.) */
  operator: ComparisonOperator

  /** The value to compare against */
  value: ConditionValue
}

/**
 * Represents a group of conditions combined with a logical operator
 */
export interface ConditionGroup extends ConditionBase {
  /** The logical operator to combine conditions (AND/OR) */
  operator: 'AND' | 'OR'

  /** The list of conditions or nested groups */
  conditions: Array<Condition | ConditionGroup>
}

/**
 * Determines whether the given object is a {@link Condition}.
 *
 * @param obj - The object to test.
 * @returns True if {@link obj} has the structure of a {@link Condition}; otherwise, false.
 */
export function isCondition(obj: unknown): obj is Condition {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    'field' in obj &&
    'operator' in obj &&
    'value' in obj
  )
}

/**
 * Determines whether the given object is a {@link ConditionGroup}.
 *
 * @param obj - The object to test.
 * @returns True if {@link obj} is a {@link ConditionGroup}; otherwise, false.
 */
export function isConditionGroup(obj: unknown): obj is ConditionGroup {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    'operator' in obj &&
    'conditions' in obj &&
    Array.isArray((obj as Record<string, unknown>).conditions)
  )
}

/**
 * Types of condition operators
 */
export type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'in'
  | 'notIn'
  | 'greaterThan'
  | 'lessThan'
  | 'between'

/**
 * Fields available for conditions
 */
export type ConditionField = 'genre' | 'year' | 'language' | 'user' | string // Allow for custom fields from API

/**
 * Form values for a condition
 */
export interface ConditionFormValues {
  field: string
  operator: ComparisonOperator
  value: ConditionValue
  negate?: boolean
}

/**
 * Form values for a condition group
 */
export interface ConditionGroupFormValues {
  operator: 'AND' | 'OR'
  conditions: ConditionFormValues[]
  negate?: boolean
}
