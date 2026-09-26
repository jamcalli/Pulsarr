import type { Condition, ConditionGroup } from '@root/types/router.types.js'

export function hasUserField(
  condition: Condition | ConditionGroup | undefined,
): boolean {
  if (!condition) {
    return false
  }

  if ('field' in condition && condition.field === 'user') {
    return true
  }

  if ('conditions' in condition && Array.isArray(condition.conditions)) {
    return condition.conditions.some((subCondition) =>
      hasUserField(subCondition),
    )
  }

  return false
}
