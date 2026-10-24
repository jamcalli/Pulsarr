export const MAX_SSE_RECONNECT_ATTEMPTS = 5
export const MAX_RECONNECT_DELAY_MS = 30000

/** Exponential backoff for a 1-based attempt, capped at `MAX_RECONNECT_DELAY_MS`, plus up to 1s of jitter. */
export function calculateRetryDelay(attempt: number): number {
  const baseDelay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS)
  const jitter = Math.floor(Math.random() * 1000)
  return baseDelay + jitter
}
