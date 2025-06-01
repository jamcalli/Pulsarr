/**
 * Date serialization utilities
 *
 * Helper functions for consistent date serialization across API endpoints
 */

/**
 * Converts a date value to an ISO 8601 string for consistent API responses.
 *
 * @param date - The date to serialize. Accepts a Date object, string, null, or undefined.
 * @returns The ISO string representation of the date, the original string if input is a string, or null if input is null or undefined.
 */
export function serializeDate(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null
  return typeof date === 'string' ? date : date.toISOString()
}

/**
 * Returns a copy of the show object with date fields serialized as ISO strings for API responses.
 *
 * The fields `last_session_date`, `created_at`, `updated_at`, and `last_updated_at` are converted to ISO string format or set to `null`/empty string as appropriate.
 *
 * @param show - The show object containing optional date fields to serialize.
 * @returns A new show object with `last_session_date` as an ISO string or `null`, and `created_at`, `updated_at`, and `last_updated_at` as ISO strings or empty strings.
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
