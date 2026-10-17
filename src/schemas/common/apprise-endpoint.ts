const PLAIN_EMAIL = /^[^\s@]+@[^\s@]+$/
const APPRISE_URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i

export function isPlainEmail(value: string): boolean {
  return !value.includes('://') && PLAIN_EMAIL.test(value)
}

/** True for a full Apprise URL or a plain email address. */
export function isValidAppriseEndpoint(value: string): boolean {
  const trimmed = value.trim()
  return APPRISE_URL.test(trimmed) || isPlainEmail(trimmed)
}
