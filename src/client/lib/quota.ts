import { formatCount, formatOrdinal } from '@/lib/format'
import type { components } from '@/types/api.js'

type QuotaType = components['schemas']['QuotaType']
type QuotaSettings = components['schemas']['QuotaSettings']

export const QUOTA_TYPE_LABELS: Record<QuotaType, string> = {
  daily: 'Daily',
  weekly_rolling: 'Weekly rolling',
  monthly: 'Monthly',
}

const SHORTEST_MONTH_DAYS = 28

/** The window a quota counts, worded to follow "has requested 3 movies". Null settings give a neutral phrase. */
export function quotaWindowPhrase(
  type: QuotaType,
  settings: QuotaSettings | null,
): string {
  if (type === 'daily') return 'today'
  if (!settings) return 'in the current period'
  if (type === 'weekly_rolling') {
    const days = settings.weeklyRolling.resetDays
    return days === 1 ? 'today' : `in the last ${formatCount(days, 'day')}`
  }
  const { resetDay } = settings.monthly
  if (resetDay === 1) return 'this month'
  // Reset days past the 28th move in short months, so only earlier ones can be named.
  return resetDay <= SHORTEST_MONTH_DAYS
    ? `since the ${formatOrdinal(resetDay)}`
    : 'since the monthly reset'
}
