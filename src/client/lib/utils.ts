import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combines multiple class name values into a single string, resolving conflicts according to Tailwind CSS rules.
 *
 * Accepts any mix of strings, arrays, or objects as class values.
 * @returns The resulting merged class name string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Cron parsing utilities

/**
 * Extracts the scheduled time and day of week from a 5-part or 6-part cron expression.
 *
 * Parses the cron expression to obtain the hour, minute, and day-of-week fields. Returns a tuple where the first element is a Date object set to the parsed hour and minute (with seconds and milliseconds zeroed), or `undefined` if parsing fails or values are invalid. The second element is the day-of-week string from the cron expression, or `"*"` if parsing fails.
 *
 * @param cronExpression - The cron expression to parse
 * @returns A tuple containing the scheduled time as a Date (or `undefined` if invalid) and the day-of-week string
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

// Chart calculation utilities

/**
 * Safely calculates a percentage from a value and total, guarding against division by zero.
 *
 * Returns 0% when the total is 0 or negative, preventing Infinity or NaN values in percentage displays.
 *
 * @param value - The numerator value
 * @param total - The denominator total
 * @returns The percentage as a rounded integer (0-100)
 */
export function calculatePercentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0
}
