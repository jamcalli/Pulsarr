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
 * Converts a Date object to a US 12-hour time string with hours and minutes.
 *
 * @param date - The date to convert
 * @returns The formatted time string, such as "3:45 PM"
 */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(date)
}

/**
 * Converts a cron-style day-of-week string to a human-readable description.
 *
 * Returns "every day" for "*", "on <DayName>" for valid indices 0–6, or "Unknown day" for invalid input.
 *
 * @param dayOfWeek - Cron day-of-week value ("*", "0"–"6")
 * @returns A human-readable string describing the day of week
 */
function formatDayOfWeek(dayOfWeek: string): string {
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
 * Formats a schedule's time and day of week into a single human-readable string.
 *
 * If the provided time is invalid or undefined, "Not set" is used for the time portion. The day of week is converted from a cron-style string to a descriptive phrase.
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
