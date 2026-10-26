/** Splits a comma-separated list into trimmed, non-empty entries, keeping duplicates. */
export function splitUrlList(value: string | undefined | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}
