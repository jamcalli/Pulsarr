import {
  formatCount,
  formatTimeOfDay,
  formatWeekday,
  pluralize,
} from '@/lib/format'
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
const TIME_STEP_MINUTES = 15
const MINUTES_PER_DAY = 24 * 60

/** `*` runs every day, a digit is a cron day of the week with Sunday as 0. */
export type ScheduleDay = '*' | (typeof WEEKDAYS)[number]

export interface DayTimeSchedule {
  day: ScheduleDay
  hour: number
  minute: number
}

function isScheduleDay(value: string): value is ScheduleDay {
  return value === '*' || WEEKDAYS.some((day) => day === value)
}

function parseField(value: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(value)) return null
  const parsed = Number(value)
  return parsed > max ? null : parsed
}

/** Reads `M H * * D` and `0 M H * * D`, null for anything else so the caller can keep it untouched. */
export function parseDayTimeCron(expression: string): DayTimeSchedule | null {
  const fields = expression.trim().split(/\s+/)
  const [seconds, ...afterSeconds] = fields
  const timeFields =
    fields.length === 6 && seconds === '0' ? afterSeconds : fields
  if (timeFields.length !== 5) return null
  const [minuteField, hourField, dayOfMonth, month, day] = timeFields
  if (dayOfMonth !== '*' || month !== '*' || !isScheduleDay(day)) return null
  const minute = parseField(minuteField, 59)
  const hour = parseField(hourField, 23)
  if (minute === null || hour === null) return null
  return { day, hour, minute }
}

export function cronForDayTime({ day, hour, minute }: DayTimeSchedule): string {
  return `${minute} ${hour} * * ${day}`
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

/** Option value for a time of day, the minutes since midnight. */
export function scheduleTimeValue(hour: number, minute: number): string {
  return String(hour * 60 + minute)
}

export function timeFromScheduleValue(value: string): {
  hour: number
  minute: number
} {
  const total = Number(value)
  return { hour: Math.floor(total / 60), minute: total % 60 }
}

/** Every 15 minutes of the day, plus the stored time when it falls between them. */
export function scheduleTimeOptions(
  stored: { hour: number; minute: number } | null,
): Array<{ value: string; label: string }> {
  const options = Array.from(
    { length: MINUTES_PER_DAY / TIME_STEP_MINUTES },
    (_, step) => {
      const total = step * TIME_STEP_MINUTES
      const hour = Math.floor(total / 60)
      const minute = total % 60
      return {
        value: scheduleTimeValue(hour, minute),
        label: formatTimeOfDay(hour, minute),
      }
    },
  )
  if (!stored) return options
  return withStoredOption(
    options,
    scheduleTimeValue(stored.hour, stored.minute),
    formatTimeOfDay(stored.hour, stored.minute),
  )
}
