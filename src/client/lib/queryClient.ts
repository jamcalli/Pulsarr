import {
  MutationCache,
  type Query,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { notifyOperationSettled } from '@/lib/operation-toasts'
import { apiErrorMessage } from '@/lib/tanstackApi'

const BACKGROUND_REFRESH_TOAST_ID = 'background-refresh-error'

/** Toasts only failed background refreshes, since first loads show their own error state on the page. */
export function notifyBackgroundRefreshError(
  error: unknown,
  query: Pick<Query<unknown, unknown>, 'state'>,
): void {
  if (query.state.data === undefined) return
  toast.add({
    id: BACKGROUND_REFRESH_TOAST_ID,
    type: 'error',
    title: 'Could not refresh. Showing the last loaded data.',
    description: apiErrorMessage(error) ?? undefined,
  })
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: notifyBackgroundRefreshError }),
  mutationCache: new MutationCache({
    onSuccess: (data, _variables, _context, mutation) =>
      notifyOperationSettled({ ok: true, data }, mutation.meta),
    onError: (error, _variables, _context, mutation) =>
      notifyOperationSettled({ ok: false, error }, mutation.meta),
  }),
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
