import { BASE_PATH } from '@/lib/basePath.js'

/**
 * Get the appropriate API path with base path support.
 * Prepends the base path (read from the <base> tag) to API routes.
 */
export function api(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return BASE_PATH === '/' ? normalizedPath : `${BASE_PATH}${normalizedPath}`
}
