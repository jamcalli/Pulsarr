/**
 * Apprise Email Resolution Utilities
 *
 * Allows users to enter just their email address (e.g., user@example.com)
 * instead of a full Apprise URL. The admin configures an email sender URL
 * once, and the system appends ?to= to send to different recipients.
 */

/**
 * Checks if a value is a plain email address (not a full Apprise URL).
 *
 * @param value - The string to check
 * @returns True if the value looks like a plain email address
 */
export function isPlainEmail(value: string): boolean {
  return value.includes('@') && !value.includes('://')
}

/**
 * Resolves a user's apprise field to a full Apprise URL.
 *
 * - If already a full URL (contains ://), returns as-is
 * - If plain email, appends ?to= to admin's sender URL
 * - If unknown format or missing sender, returns null
 *
 * @param userValue - The user's configured apprise value
 * @param adminEmailSender - The admin's configured email sender URL
 * @returns The resolved Apprise URL, or null if resolution fails
 */
export function resolveAppriseUrl(
  userValue: string,
  adminEmailSender?: string,
): string | null {
  if (!userValue) return null

  // Already a full Apprise URL - use as-is
  if (userValue.includes('://')) {
    return userValue
  }

  // Plain email - need admin sender URL
  if (isPlainEmail(userValue)) {
    if (!adminEmailSender) {
      // Admin sender not configured - can't send to plain email
      return null
    }
    const separator = adminEmailSender.includes('?') ? '&' : '?'
    return `${adminEmailSender}${separator}to=${encodeURIComponent(userValue)}`
  }

  // Unknown format
  return null
}

/**
 * Resolves multiple comma-separated apprise URLs/emails.
 *
 * For each value in the comma-separated list:
 * - Full URLs are kept as-is
 * - Plain emails are resolved using the admin sender
 * - Invalid/unresolvable values are filtered out
 *
 * @param userValue - Comma-separated apprise URLs or email addresses
 * @param adminEmailSender - The admin's configured email sender URL
 * @returns Comma-separated resolved URLs, or null if none could be resolved
 */
export function resolveAppriseUrls(
  userValue: string,
  adminEmailSender?: string,
): string | null {
  if (!userValue) return null

  const resolvedUrls = userValue
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => resolveAppriseUrl(url, adminEmailSender))
    .filter((url): url is string => url !== null)

  return resolvedUrls.length > 0 ? resolvedUrls.join(',') : null
}
