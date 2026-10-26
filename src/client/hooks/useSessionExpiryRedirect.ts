import type { Middleware } from 'openapi-fetch'
import { useEffect } from 'react'
import { queryClient } from '@/lib/queryClient'
import { goToLogin, isSessionExpired } from '@/lib/session-expiry'
import { apiFetch } from '@/lib/tanstackApi'

/** Sends the new UI to login when any API call answers 401, while the caller stays mounted. */
export function useSessionExpiryRedirect() {
  useEffect(() => {
    let redirecting = false
    const middleware: Middleware = {
      onResponse({ request, response }) {
        if (
          redirecting ||
          !isSessionExpired(
            response.status,
            new URL(request.url).pathname,
            window.location.pathname,
          )
        ) {
          return
        }
        redirecting = true
        queryClient.clear()
        goToLogin()
      },
    }
    apiFetch.use(middleware)
    return () => apiFetch.eject(middleware)
  }, [])
}
