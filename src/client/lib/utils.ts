import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Schedule formatting utilities
const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/**
 * Formats a date as a time string in US format
 */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(date)
}

/**
 * Formats a day of week value (cron format) as a readable string
 */
export function formatDayOfWeek(dayOfWeek: string): string {
  if (dayOfWeek === '*') {
    return 'every day'
  }

  const dayIndex = Number.parseInt(dayOfWeek, 10)
  const dayName = DAYS_OF_WEEK[dayIndex]

  return dayName ? `on ${dayName}` : 'Unknown day'
}

/**
 * Formats schedule time and day of week as a readable string
 */
export function formatScheduleDisplay(
  scheduleTime: Date | undefined,
  dayOfWeek: string,
): string {
  const timeString =
    scheduleTime && !Number.isNaN(scheduleTime.getTime())
      ? formatTime(scheduleTime)
      : 'Not set'

  const dayString = formatDayOfWeek(dayOfWeek)

  return `${timeString} ${dayString}`
}

// Cron parsing utilities

/**
 * Parse a cron expression to extract schedule time and day of week
 * Supports both 5-part and 6-part cron expressions
 *
 * @param cronExpression - The cron expression to parse
 * @returns Tuple of [Date | undefined, string] where Date is the schedule time and string is day of week
 */
export function parseCronExpression(
  cronExpression: string,
): [Date | undefined, string] {
  try {
    const cronParts = cronExpression.split(' ')

    // Expected formats:
    // 5-part: minute hour day month dayOfWeek
    // 6-part: second minute hour day month dayOfWeek
    if (cronParts.length >= 5) {
      const hourIndex = cronParts.length === 5 ? 1 : 2
      const minuteIndex = cronParts.length === 5 ? 0 : 1
      const dayIndex = cronParts.length === 5 ? 4 : 5

      const hour = Number.parseInt(cronParts[hourIndex], 10)
      const minute = Number.parseInt(cronParts[minuteIndex], 10)
      const day = cronParts[dayIndex]

      // Validate time values
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const date = new Date()
        date.setHours(hour)
        date.setMinutes(minute)
        date.setSeconds(0)
        date.setMilliseconds(0)
        return [date, day]
      }

      console.warn(
        `Invalid time values in cron expression: hour=${hour}, minute=${minute}`,
      )
    } else {
      console.warn(
        `Unexpected cron format: ${cronParts.length} parts, expected at least 5`,
      )
    }
  } catch (e) {
    console.error('Failed to parse cron expression:', e)
  }

  return [undefined, '*']
}
