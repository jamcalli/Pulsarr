import { routerRulePriorityFor } from '@root/schemas/content-router/content-router.schema.js'

/** The validation message for next, or undefined when it is in range, left out, or already stored on the rule. */
export function rejectedRouterRulePriority(
  next: number | undefined,
  stored: number | null | undefined,
): string | undefined {
  if (next === undefined) return undefined
  return routerRulePriorityFor(stored ?? null).safeParse(next).error?.issues[0]
    ?.message
}
