declare global {
  interface Window {
    __BASE_PATH__: string
  }
}

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
