/**
 * Returns a human-readable label for a given quota type.
 *
 * If the quota type is unrecognized, returns the original input string.
 *
 * @param quotaType - The quota type identifier to format
 * @returns The formatted quota type label
 */
export function formatQuotaType(quotaType: string): string {
  switch (quotaType) {
    case 'daily':
      return 'Daily'
    case 'weekly_rolling':
      return 'Weekly Rolling'
    case 'monthly':
      return 'Monthly'
    default:
      return quotaType
  }
}

/**
 * Formats a quota limit with its corresponding time unit based on the quota type.
 *
 * @param quotaLimit - The numeric value representing the quota limit.
 * @param quotaType - The quota period type; recognized values are 'daily', 'weekly_rolling', and 'monthly'.
 * @returns A string combining the quota limit and its time unit (e.g., "10/day"), or just the limit as a string if the type is unrecognized.
 */
export function formatQuotaLimit(
  quotaLimit: number,
  quotaType: string,
): string {
  switch (quotaType) {
    case 'daily':
      return `${quotaLimit}/day`
    case 'weekly_rolling':
      return `${quotaLimit}/week`
    case 'monthly':
      return `${quotaLimit}/month`
    default:
      return quotaLimit.toString()
  }
}

/**
 * Generates a quota status message based on usage, limit, and exceeded state.
 *
 * @param currentUsage - The current quota usage amount
 * @param quotaLimit - The maximum allowed quota
 * @param exceeded - Indicates if the quota has been exceeded
 * @returns 'Exceeded' if the quota is exceeded, 'At Limit' if usage equals the limit, or a string showing the remaining quota units
 */
export function getQuotaStatusText(
  currentUsage: number,
  quotaLimit: number,
  exceeded: boolean,
): string {
  if (exceeded) {
    return 'Exceeded'
  }

  const remaining = quotaLimit - currentUsage
  if (remaining === 0) {
    return 'At Limit'
  }

  return `${remaining} remaining`
}
