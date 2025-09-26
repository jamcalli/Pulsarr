/**
 * Parses quality profile ID from various input types.
 *
 * Accepts numeric IDs as numbers or numeric strings and validates they are positive integers.
 * Non-numeric strings and invalid values return undefined.
 *
 * @param value - The quality profile value to parse (number, string, or other)
 * @returns The numeric quality profile ID if valid, undefined otherwise
 *
 * @example
 * parseQualityProfileId(1) // returns 1
 * parseQualityProfileId("8") // returns 8
 * parseQualityProfileId("Any") // returns undefined
 * parseQualityProfileId(null) // returns undefined
 */
export function parseQualityProfileId(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
  return undefined
}
