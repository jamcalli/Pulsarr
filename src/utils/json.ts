import type { FastifyBaseLogger } from 'fastify'

/** Returns fallback on empty or invalid JSON and warns on a parse failure */
export function parseJsonOr<T>(
  value: string | null | undefined,
  fallback: T,
  log?: FastifyBaseLogger,
  context?: string,
): T {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (error) {
    log?.warn({ context, length: value.length, error }, 'JSON parse error')
    return fallback
  }
}
