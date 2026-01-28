import { api } from '@/lib/api'
import { router } from '@/router/router'

export const MAX_SSE_RECONNECT_ATTEMPTS = 5
export const MAX_RECONNECT_DELAY_MS = 30000

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt - Current attempt number (1-based)
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(attempt: number): number {
  const baseDelay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS)
  const jitter = Math.floor(Math.random() * 1000)
  return baseDelay + jitter
}

/**
 * Check if the current session is authenticated by making a lightweight request.
 * Returns true if authenticated, false if 401.
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const response = await fetch(api('/v1/users/check'))
    return response.ok
  } catch {
    // Network error - assume auth is fine, let SSE retry handle it
    return true
  }
}

/**
 * Redirect to login page
 */
export function redirectToLogin(): void {
  // Only redirect if not already on login page
  if (!window.location.pathname.endsWith('/login')) {
    router.navigate('/login')
  }
}

/**
 * Handle SSE connection error with auth detection.
 * If auth has expired, redirects to login.
 * Otherwise, returns whether retry should continue.
 *
 * @param currentAttempts - Current retry attempt count
 * @returns Object with shouldRetry and newAttempts
 */
export async function handleSseError(
  currentAttempts: number,
): Promise<{ shouldRetry: boolean; newAttempts: number }> {
  const newAttempts = currentAttempts + 1

  // Check if this is an auth failure
  const isAuthenticated = await checkAuthStatus()
  if (!isAuthenticated) {
    console.warn(
      'SSE connection failed due to authentication - redirecting to login',
    )
    redirectToLogin()
    return { shouldRetry: false, newAttempts }
  }

  // Not an auth issue - check if we should retry
  if (newAttempts <= MAX_SSE_RECONNECT_ATTEMPTS) {
    return { shouldRetry: true, newAttempts }
  }

  console.warn('SSE connection failed after max attempts, giving up')
  return { shouldRetry: false, newAttempts }
}
