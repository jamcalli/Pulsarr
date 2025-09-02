/**
 * URL utility functions for endpoint comparison and normalization
 */

/**
 * Waits for an exponentially increasing delay (capped) plus randomized jitter before resolving.
 *
 * The delay is min(baseDelayMs * 2^attempt, maxDelayMs) with up to 10% additional random jitter.
 *
 * @param attempt - The current retry attempt (0-based).
 * @param baseDelayMs - Base delay in milliseconds (default: 500).
 * @param maxDelayMs - Maximum delay in milliseconds (default: 2000).
 * @returns A promise that resolves after the computed delay.
 */
export function delayWithBackoffAndJitter(
  attempt: number,
  baseDelayMs = 500,
  maxDelayMs = 2000,
): Promise<void> {
  const exponentialDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
  const jitter = Math.random() * 0.1 * exponentialDelay // 10% jitter
  const finalDelay = exponentialDelay + jitter
  return new Promise((resolve) => setTimeout(resolve, finalDelay))
}

/**
 * Normalize a URL to a canonical "protocol//host/path" form, including the full path.
 *
 * If `url` is falsy an empty string is returned. If the input has no scheme, `http://` is assumed for parsing.
 * Trailing slashes on the pathname are removed. If parsing fails, the function returns the input lowercased,
 * trimmed, and with trailing slashes removed as a fallback.
 *
 * @param url - URL to normalize; may be `undefined` or `null` (returns `''`).
 * @returns The normalized endpoint string in the form `protocol//host/path`, or a trimmed lowercase fallback for malformed input.
 */
export function normalizeEndpointWithPath(url?: string | null): string {
  if (!url) return ''
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
    const u = hasScheme ? new URL(url) : new URL(`http://${url}`)
    u.pathname = u.pathname.replace(/\/+$/, '')
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return String(url).trim().replace(/\/+$/, '').toLowerCase()
  }
}

/**
 * Checks if two URL endpoints represent the same server, accounting for:
 * - Protocol inference (assumes http:// if no protocol detected)
 * - Case-insensitive protocol and hostname comparison
 * - Proper IPv6 address handling with brackets
 * - Port preservation for accurate comparison
 *
 * @param a First URL endpoint
 * @param b Second URL endpoint
 * @returns true if both URLs point to the same server endpoint.
 * @remarks If both inputs are null/undefined/empty, returns true.
 *
 * @example
 * ```typescript
 * isSameServerEndpoint('http://host', 'HTTP://host/') // true (case insensitive)
 * isSameServerEndpoint('sonarr.local:8989', 'http://sonarr.local:8989') // true
 * isSameServerEndpoint('HOST:8989', 'host:8989') // true (case insensitive)
 * isSameServerEndpoint('https://[::1]:8989', 'HTTPS://[::1]:8989') // true (IPv6)
 * isSameServerEndpoint('http://[::1]:8989', 'http://[::1]:8989/') // true
 * isSameServerEndpoint('http://server-a:8989', 'http://server-b:8989') // false
 * ```
 */
export function isSameServerEndpoint(
  a?: string | null,
  b?: string | null,
): boolean {
  const normalize = (url?: string | null) => {
    if (!url) return ''
    try {
      // Accept any scheme if present; otherwise assume http://
      const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
      const u = hasScheme ? new URL(url) : new URL(`http://${url}`)
      // Use u.host to preserve IPv6 brackets and port when present
      const protocol = u.protocol.toLowerCase()
      const host = u.host.toLowerCase()
      return `${protocol}//${host}`
    } catch {
      // Fallback for malformed URLs - just normalize case and trailing slashes
      return String(url).trim().replace(/\/+$/, '').toLowerCase()
    }
  }
  return normalize(a) === normalize(b)
}
