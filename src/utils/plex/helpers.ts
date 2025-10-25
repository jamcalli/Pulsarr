import type { Config } from '@root/types/config.types.js'

// Network timeout constants
export const PLEX_API_TIMEOUT_MS = 5000 // 5 seconds for Plex API calls

// Custom error interface for rate limit errors
export interface RateLimitError extends Error {
  isRateLimitExhausted: boolean
}

/**
 * Determines whether an error represents a Plex API rate limit exhaustion.
 *
 * @param error - The value to check.
 * @returns `true` if the error is a {@link RateLimitError} with rate limit exhaustion; otherwise, `false`.
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return (
    error instanceof Error &&
    'isRateLimitExhausted' in error &&
    (error as RateLimitError).isRateLimitExhausted === true
  )
}

/**
 * Checks if the configuration includes at least one Plex token.
 *
 * @returns `true` if the configuration's `plexTokens` property is a non-empty array; otherwise, `false`.
 */
export function hasValidPlexTokens(config: Config): boolean {
  return Boolean(
    config.plexTokens &&
      Array.isArray(config.plexTokens) &&
      config.plexTokens.length > 0,
  )
}
