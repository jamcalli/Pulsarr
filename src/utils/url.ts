/**
 * URL utility functions for endpoint comparison and normalization
 */

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
