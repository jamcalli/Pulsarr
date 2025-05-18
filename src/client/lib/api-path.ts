// Base path will be replaced at runtime by docker-entrypoint.sh
const basePath = typeof __BASE_PATH__ !== 'undefined' ? __BASE_PATH__ : ''

/**
 * Utility function to generate API paths with the proper base path
 * @param path The API path (e.g., '/api/v1/users')
 * @returns The full path including base path if configured
 */
export function apiPath(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${basePath}${normalizedPath}`
}

/**
 * Get the base path for use in routing
 */
export function getBasePath(): string {
  return basePath
}
