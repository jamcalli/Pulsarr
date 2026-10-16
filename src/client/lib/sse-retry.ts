import { MAX_SSE_RECONNECT_ATTEMPTS } from '@/lib/sse-retry-policy'
import { apiFetch } from '@/lib/tanstackApi'

const AUTH_CHECK_TIMEOUT_MS = 5000

/** False only on a 401, which the session expiry middleware turns into a redirect to login. */
async function isSessionValid(): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AUTH_CHECK_TIMEOUT_MS)

  try {
    const { response } = await apiFetch.GET('/v1/users/check', {
      signal: controller.signal,
    })
    return response.status !== 401
  } catch {
    return true
  } finally {
    clearTimeout(timeout)
  }
}

/** Stops retrying once the session is gone or the attempts run out. */
export async function handleSseError(
  currentAttempts: number,
): Promise<{ shouldRetry: boolean; newAttempts: number }> {
  const newAttempts = currentAttempts + 1
  if (!(await isSessionValid())) {
    return { shouldRetry: false, newAttempts }
  }
  return {
    shouldRetry: newAttempts <= MAX_SSE_RECONNECT_ATTEMPTS,
    newAttempts,
  }
}
