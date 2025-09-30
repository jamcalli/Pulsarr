/**
 * Get the appropriate API path based on environment
 * - Development: Use absolute paths for @fastify/vite integration
 * - Production: Use relative paths for subfolder support
 */
export function api(path: string): string {
  // Always use relative paths for subfolder support
  return `.${path}`
}