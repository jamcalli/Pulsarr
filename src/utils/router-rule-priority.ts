import { RouterRulePrioritySchema } from '@root/schemas/content-router/content-router.schema.js'

/** The validation message for next, or undefined when it is in range, left out, or already stored on the rule. */
export function rejectedRouterRulePriority(
  next: number | undefined,
  stored: number | null | undefined,
): string | undefined {
  if (next === undefined || next === stored) return undefined
  const result = RouterRulePrioritySchema.safeParse(next)
  return result.success ? undefined : result.error.issues[0]?.message
}
