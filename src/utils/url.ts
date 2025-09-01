/**
 * URL utility functions for endpoint comparison and normalization
 */

/**
 * Checks if two URL endpoints represent the same server, accounting for:
 * - Protocol inference (assumes http:// if no protocol)
 * - Case-insensitive hostnames
 * - Trailing slashes
 * - Preserves all explicit ports for comparison
 *
 * @param a First URL endpoint
 * @param b Second URL endpoint
 * @returns true if both URLs point to the same server endpoint
 *
 * @example
 * ```typescript
 * isSameServerEndpoint('http://host', 'http://host/') // true
 * isSameServerEndpoint('sonarr.local:8989', 'http://sonarr.local:8989') // true
 * isSameServerEndpoint('HOST:8989', 'host:8989') // true (case insensitive)
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
      const u = url.startsWith('http') ? new URL(url) : new URL(`http://${url}`)
      // Always include port in comparison (either explicit or empty)
      const hostWithPort = u.port ? `${u.hostname}:${u.port}` : u.hostname
      return `${u.protocol}//${hostWithPort.toLowerCase()}`
    } catch {
      // Fallback for malformed URLs - just normalize case and trailing slashes
      return String(url).replace(/\/+$/, '').toLowerCase()
    }
  }
  return normalize(a) === normalize(b)
}
