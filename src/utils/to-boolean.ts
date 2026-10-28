/** Null or undefined falls back to defaultValue, so a stored 0 or false stays false. */
export function toBoolean(
  value: boolean | number | null | undefined,
  defaultValue: boolean,
): boolean {
  return value == null ? defaultValue : Boolean(value)
}
