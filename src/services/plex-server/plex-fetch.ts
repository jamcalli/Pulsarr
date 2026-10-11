export const PLEX_API_TIMEOUT = 30000
const PLEX_API_ATTEMPTS = 2
const PLEX_API_RETRY_DELAY_MS = 500

/** Retries a timed-out or unreachable request once, never one that got an HTTP response. */
export async function fetchPlex(
  url: URL,
  init: Omit<RequestInit, 'signal'>,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url.toString(), {
        ...init,
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
      })
    } catch (error) {
      const transient =
        error instanceof TypeError ||
        (error instanceof Error && error.name === 'TimeoutError')
      if (!transient || attempt >= PLEX_API_ATTEMPTS) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, PLEX_API_RETRY_DELAY_MS),
      )
    }
  }
}
