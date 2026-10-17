export function isPlainEmail(value: string): boolean {
  return value.includes('@') && !value.includes('://')
}

/** True for a full Apprise URL or a plain email address. */
export function isValidAppriseEndpoint(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.includes('://') || isPlainEmail(trimmed)
}
