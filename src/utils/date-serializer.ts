/**
 * Date serialization utilities
 *
 * Helper functions for consistent date serialization across API endpoints
 */

/**
 * Serializes a date to ISO string format for API responses
 * @param date - Date object, string, null, or undefined
 * @returns ISO string or null
 */
export function serializeDate(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null
  return typeof date === 'string' ? date : date.toISOString()
}

/**
 * Serializes rolling monitored show dates for API responses
 * @param show - Show object with date fields
 * @returns Show object with serialized date fields
 */
export function serializeRollingShowDates<
  T extends {
    last_session_date?: Date | string | null
    created_at?: Date | string | null
    updated_at?: Date | string | null
    last_updated_at?: Date | string | null
  },
>(
  show: T,
): T & {
  last_session_date: string | null
  created_at: string
  updated_at: string
  last_updated_at: string
} {
  return {
    ...show,
    last_session_date: serializeDate(show.last_session_date),
    created_at: serializeDate(show.created_at) || '',
    updated_at: serializeDate(show.updated_at) || '',
    last_updated_at:
      serializeDate(show.last_updated_at) ||
      serializeDate(show.updated_at) ||
      '',
  }
}
