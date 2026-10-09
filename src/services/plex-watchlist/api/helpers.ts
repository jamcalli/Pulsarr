import type { Config } from '@root/types/config.types.js'

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

/** Seconds to wait; undefined for a missing or unparseable header, 0 for a date already past. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const asSeconds = Number.parseInt(header, 10)
  if (!Number.isNaN(asSeconds)) return asSeconds
  const asDateMs = Date.parse(header)
  if (Number.isNaN(asDateMs)) return undefined
  return Math.ceil(Math.max(0, asDateMs - Date.now()) / 1000)
}

/** Resolves after `ms`, or rejects with the signal's reason once it aborts. */
export const abortableDelay = (
  ms: number,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
