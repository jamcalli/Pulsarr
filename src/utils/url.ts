/**
 * Normalizes a configured basePath to '/' or '/segment' - leading slash,
 * no trailing slash, regardless of how the user typed it.
 *
 * @example
 * normalizeBasePath('/') // '/'
 * normalizeBasePath('pulsarr') // '/pulsarr'
 * normalizeBasePath('//pulsarr//') // '/pulsarr'
 */
export function normalizeBasePath(basePath?: string): string {
  if (!basePath || basePath === '/') return '/'
  return `/${basePath.replace(/^\/+|\/+$/g, '')}`
}

/**
 * Waits min(baseDelayMs * 2^attempt, maxDelayMs) plus up to 10% random
 * jitter before resolving.
 */
export function delayWithBackoffAndJitter(
  attempt: number,
  baseDelayMs = 500,
  maxDelayMs = 2000,
): Promise<void> {
  const exponentialDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
  const jitter = Math.random() * 0.1 * exponentialDelay
  const finalDelay = exponentialDelay + jitter
  return new Promise((resolve) => setTimeout(resolve, finalDelay))
}

/**
 * Normalizes a URL to protocol//host/path for comparison. Assumes http://
 * when no scheme is present; falls back to trimmed lowercase input when
 * parsing fails.
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
 * Whether two endpoints point at the same server (protocol + host + port,
 * path ignored). Assumes http:// when no scheme, compares case-insensitively.
 * Two empty inputs compare equal.
 *
 * @example
 * isSameServerEndpoint('sonarr.local:8989', 'http://SONARR.local:8989/') // true
 * isSameServerEndpoint('https://[::1]:8989', 'HTTPS://[::1]:8989') // true
 * isSameServerEndpoint('http://server-a:8989', 'http://server-b:8989') // false
 */
export function isSameServerEndpoint(
  a?: string | null,
  b?: string | null,
): boolean {
  const normalize = (url?: string | null) => {
    if (!url) return ''
    try {
      const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
      const u = hasScheme ? new URL(url) : new URL(`http://${url}`)
      // u.host preserves IPv6 brackets and any non-default port
      const protocol = u.protocol.toLowerCase()
      const host = u.host.toLowerCase()
      return `${protocol}//${host}`
    } catch {
      return String(url).trim().replace(/\/+$/, '').toLowerCase()
    }
  }
  return normalize(a) === normalize(b)
}
