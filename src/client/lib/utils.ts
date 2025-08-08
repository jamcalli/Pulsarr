import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges multiple class name values into a single string, resolving Tailwind CSS class conflicts.
 *
 * Accepts any combination of strings, arrays, or objects as class values.
 * @returns The merged class name string.
 */
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
 * Formats a Date object into a 12-hour US locale time string with hours and minutes.
 *
 * @param date - The date to format
 * @returns The formatted time string (e.g., "3:45 PM")
 */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(date)
}

/**
 * Converts a cron-style day-of-week string to a human-readable description.
 *
 * Returns "every day" for "*", "on <DayName>" for valid indices (0–6), or "Unknown day" for invalid input.
 *
 * @param dayOfWeek - Cron day-of-week value ("*", "0"–"6")
 * @returns A human-readable string describing the day of week
 */
export function formatDayOfWeek(dayOfWeek: string): string {
  if (dayOfWeek === '*') {
    return 'every day'
  }

  const dayIndex = Number.parseInt(dayOfWeek, 10)
  if (Number.isNaN(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    return 'Unknown day'
  }
  const dayName = DAYS_OF_WEEK[dayIndex]

  return `on ${dayName}`
}

/**
 * Returns a human-readable string combining the formatted schedule time and day of week.
 *
 * If `scheduleTime` is invalid or undefined, "Not set" is used for the time portion.
 *
 * @param scheduleTime - The scheduled time as a Date object, or undefined if not set
 * @param dayOfWeek - The cron-style day of week string (e.g., "0", "1", "*")
 * @returns A string such as "3:45 PM on Monday" or "Not set every day"
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
 * Parses a cron expression to extract the scheduled time and day of week.
 *
 * Supports both 5-part and 6-part cron formats. Returns a tuple containing a Date object set to the parsed hour and minute (with seconds and milliseconds zeroed), and the day of week string. If parsing fails or the cron format is invalid, returns `[undefined, '*']`.
 *
 * @param cronExpression - The cron expression to parse
 * @returns A tuple where the first element is the scheduled time as a Date (or `undefined` if invalid), and the second element is the day of week string
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
