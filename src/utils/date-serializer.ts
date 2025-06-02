/**
 * Date serialization utilities
 *
 * Helper functions for consistent date serialization across API endpoints
 */

/**
 * Serializes a date value to an ISO 8601 string or returns the original string.
 *
 * If the input is a Date object, returns its ISO string representation. If the input is a string, returns it unchanged. Returns null if the input is null or undefined.
 *
 * @param date - The date value to serialize.
 * @returns The ISO 8601 string, the original string, or null.
 */
export function serializeDate(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null
  return typeof date === 'string' ? date : date.toISOString()
}

/**
 * Serializes the date fields of a show object to ISO 8601 strings for consistent API responses.
 *
 * Converts `last_session_date` to an ISO string or `null`, and ensures `created_at`, `updated_at`, and `last_updated_at` are ISO strings or empty strings if missing. If `last_updated_at` is absent, it falls back to the serialized `updated_at` or an empty string.
 *
 * @param show - An object with optional date fields to be serialized.
 * @returns A new object with the same properties as {@link show}, but with date fields standardized as ISO strings or appropriate fallbacks.
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
