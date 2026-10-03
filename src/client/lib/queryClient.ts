import { type Query, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiErrorMessage } from '@/lib/tanstackApi'

const BACKGROUND_REFRESH_TOAST_ID = 'background-refresh-error'

/** Toasts only failed background refreshes, since first loads show their own error state on the page. */
export function notifyBackgroundRefreshError(
  error: unknown,
  query: Pick<Query<unknown, unknown>, 'state'>,
): void {
  if (query.state.data === undefined) return
  toast.error('Could not refresh. Showing the last loaded data.', {
    id: BACKGROUND_REFRESH_TOAST_ID,
    description: apiErrorMessage(error) ?? undefined,
  })
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: notifyBackgroundRefreshError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})
