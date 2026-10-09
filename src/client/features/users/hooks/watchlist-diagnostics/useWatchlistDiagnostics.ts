import type { WatchlistDiagnostics } from '@root/schemas/watchlist-diagnostics/watchlist-diagnostics.schema'
import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/tanstackApi'

export class WatchlistDiagnosticsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message)
    this.name = 'WatchlistDiagnosticsRequestError'
  }
}

function describeFailure(status: number, message: string | undefined) {
  // 5xx bodies carry a generic message, so explain the likely cause here
  if (status === 502) {
    return 'Could not fetch the live Plex watchlist for this user. Check the Plex connection and try again.'
  }
  return message ?? 'Failed to run watchlist diagnostics'
}

/**
 * Runs watchlist diagnostics for one user on demand. A mutation rather than a
 * query, so it never refetches in the background: each run calls Plex.
 */
export function useRunWatchlistDiagnostics() {
  return useMutation({
    mutationFn: async (userId: number): Promise<WatchlistDiagnostics> => {
      const { data, error, response } = await apiFetch.POST(
        '/v1/watchlist-diagnostics/users/{userId}',
        { params: { path: { userId } } },
      )
      if (error || !data) {
        const retryAfter = Number(response.headers.get('Retry-After'))
        throw new WatchlistDiagnosticsRequestError(
          describeFailure(
            response.status,
            (error as { message?: string } | undefined)?.message,
          ),
          response.status,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        )
      }
      return data.diagnostics
    },
  })
}
