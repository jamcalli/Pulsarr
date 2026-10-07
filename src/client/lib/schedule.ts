import { formatCount, pluralize } from '@/lib/format'
import { withStoredOption } from '@/lib/select-options'

export const INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12] as const

export function cronForIntervalHours(hours: number): string {
  return `0 */${hours} * * *`
}

/** One option per preset interval, plus the current expression when it matches none of them. */
export function intervalOptions(
  current: string,
): Array<{ value: string; label: string }> {
  return withStoredOption(
    INTERVAL_HOURS.map((hours) => ({
      value: cronForIntervalHours(hours),
      label: pluralize(
        hours,
        'Every hour',
        `Every ${formatCount(hours, 'hour')}`,
      ),
    })),
    current,
    `Custom: ${current}`,
  )
}
