import { formatCount, formatHour, formatWeekday, pluralize } from '@/lib/format'
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

const WEEKDAYS = ['0', '1', '2', '3', '4', '5', '6'] as const
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** `*` runs every day, a digit is a cron day of the week with Sunday as 0. */
export type ScheduleDay = '*' | (typeof WEEKDAYS)[number]

export interface DayHourSchedule {
  day: ScheduleDay
  hour: number
}

function isScheduleDay(value: string): value is ScheduleDay {
  return value === '*' || WEEKDAYS.some((day) => day === value)
}

/** Null when the expression is anything but `0 H * * D`, so the caller can keep it untouched. */
export function parseDayHourCron(expression: string): DayHourSchedule | null {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minute, hour, dayOfMonth, month, day] = fields
  if (minute !== '0' || dayOfMonth !== '*' || month !== '*') return null
  if (!/^\d{1,2}$/.test(hour) || Number(hour) > 23) return null
  if (!isScheduleDay(day)) return null
  return { day, hour: Number(hour) }
}

export function cronForDayHour({ day, hour }: DayHourSchedule): string {
  return `0 ${hour} * * ${day}`
}

export function scheduleDayOptions(): Array<{
  value: ScheduleDay
  label: string
}> {
  return [
    { value: '*', label: 'Every day' },
    ...WEEKDAYS.map((day) => ({
      value: day,
      label: formatWeekday(Number(day)),
    })),
  ]
}

export function scheduleHourOptions(): Array<{ value: string; label: string }> {
  return HOURS.map((hour) => ({
    value: String(hour),
    label: formatHour(hour),
  }))
}
