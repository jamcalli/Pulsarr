/**
 * Routing Helpers Module
 *
 * Utility functions for routing logic.
 */

import type { Condition, ConditionGroup } from '@root/types/router.types.js'

/**
 * Checks if a condition or condition group contains a user field.
 *
 * Used to determine if routing rules are user-specific, which affects
 * whether items need to be routed per-user or can be batched.
 *
 * @param condition - The condition or condition group to check
 * @returns True if the condition contains a user field
 */
export function hasUserField(
  condition: Condition | ConditionGroup | undefined,
): boolean {
  // Base case: undefined or null
  if (!condition) {
    return false
  }

  // Check if this is a condition with field === 'user'
  if ('field' in condition && condition.field === 'user') {
    return true
  }

  // Check if this is a condition group with sub-conditions
  if ('conditions' in condition && Array.isArray(condition.conditions)) {
    return condition.conditions.some((subCondition) =>
      hasUserField(subCondition),
    )
  }

  // Otherwise, return false
  return false
}
