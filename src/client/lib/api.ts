/**
 * Get the appropriate API path with base path support
 * Prepends the configured base path to API routes
 * Uses runtime configuration set by the server
 */
export function api(path: string): string {
  const basePath = window.__BASE_PATH__ || '/'

  // Remove trailing slash from base path if present
  const normalizedBase =
    basePath.endsWith('/') && basePath !== '/'
      ? basePath.slice(0, -1)
      : basePath

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return normalizedBase === '/'
    ? normalizedPath
    : `${normalizedBase}${normalizedPath}`
}

/**
 * Get the appropriate navigation path with base path support
 *
 * This is a semantic alias for api() when used with React Router navigation.
 * While technically identical to api(), using navPath() makes code more readable
 * by clearly indicating the path is for navigation (navigate()) rather than
 * API calls (fetch()).
 *
 * Prepends the configured base path to navigation routes using the same logic
 * as api(). If future divergence is needed (e.g., hash routing, state params),
 * this function can be extended without affecting API endpoint construction.
 *
 * @param path - Navigation path (e.g., '/login', '/dashboard')
 * @returns Path with basePath prefix applied
 *
 * @example
 * ```typescript
 * // For navigation
 * navigate(navPath('/login'))  // Clear intent: routing
 *
 * // For API calls
 * fetch(api('/v1/users/login')) // Clear intent: API endpoint
 * ```
 */
export function navPath(path: string): string {
  return api(path)
}
