/**
 * Formats quota type for display
 */
export function formatQuotaType(quotaType: string): string {
  switch (quotaType) {
    case 'daily':
      return 'Daily'
    case 'weekly_rolling':
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
    default:
      return quotaType
  }
}

/**
 * Formats quota limit for display
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
 * Gets quota status text for display
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
