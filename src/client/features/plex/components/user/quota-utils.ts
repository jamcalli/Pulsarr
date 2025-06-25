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
 * Returns a formatted string combining the quota limit and its time unit.
 *
 * @param quotaLimit - The numeric quota limit
 * @param quotaType - The type of quota period (e.g., 'daily', 'weekly_rolling', 'monthly')
 * @returns The quota limit with the appropriate time unit suffix, or the limit as a string if the type is unrecognized
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
 * Returns a status message indicating quota usage based on current usage, quota limit, and whether the quota has been exceeded.
 *
 * @param currentUsage - The current amount of quota used
 * @param quotaLimit - The maximum allowed quota
 * @param exceeded - Whether the quota has been exceeded
 * @returns A string representing the quota status: 'Exceeded', 'At Limit', or the number of units remaining
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
