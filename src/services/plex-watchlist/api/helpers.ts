import type { Config } from '@root/types/config.types.js'
import { USER_AGENT } from '@utils/version.js'

export const PLEX_API_TIMEOUT_MS = 30_000

export interface RateLimitError extends Error {
  isRateLimitExhausted: boolean
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return (
    error instanceof Error &&
    'isRateLimitExhausted' in error &&
    (error as RateLimitError).isRateLimitExhausted === true
  )
}

export function hasValidPlexTokens(config: Config): boolean {
  return Boolean(
    config.plexTokens &&
      Array.isArray(config.plexTokens) &&
      config.plexTokens.length > 0,
  )
}

/** Seconds to wait, undefined for a missing or unparseable header, and 0 for a date already past. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const asSeconds = Number.parseInt(header, 10)
  if (!Number.isNaN(asSeconds)) return asSeconds
  const asDateMs = Date.parse(header)
  if (Number.isNaN(asDateMs)) return undefined
  return Math.ceil(Math.max(0, asDateMs - Date.now()) / 1000)
}

export function communityHeaders(token: string): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    'X-Plex-Token': token,
  }
}

export function discoverHeaders(token: string): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    'X-Plex-Token': token,
  }
}

export function discoverItemKey(key: string | undefined): string | undefined {
  return key?.replace('/library/metadata/', '').replace('/children', '')
}
