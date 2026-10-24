import { useMutation } from '@tanstack/react-query'
import { invalidateRollingShows } from '@/features/library/lib/session-monitoring/session-monitoring-queries'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import {
  apiFetch,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'

export type ShowAction =
  | { kind: 'reset'; id: number }
  | { kind: 'stop'; id: number }
  | { kind: 'resetInactive'; inactivityDays: number }

const ERROR_FALLBACKS: Record<ShowAction['kind'], string> = {
  reset: 'The show was not reset. Try again.',
  stop: 'The show is still rolling. Try again.',
  resetInactive: 'The inactive shows were not reset. Try again.',
}

async function runAction(action: ShowAction) {
  if (action.kind === 'reset') {
    const { data, error } = await apiFetch.POST(
      '/v1/session-monitoring/rolling-monitored/{id}/reset',
      { params: { path: { id: action.id } } },
    )
    if (error) throw error
    return requireSuccess(data)
  }
  if (action.kind === 'stop') {
    const { data, error } = await apiFetch.DELETE(
      '/v1/session-monitoring/rolling-monitored/{id}',
      { params: { path: { id: action.id }, query: { reset: 'false' } } },
    )
    if (error) throw error
    return requireSuccess(data)
  }
  const { data, error } = await apiFetch.POST(
    '/v1/session-monitoring/rolling-monitored/reset-inactive',
    { body: { inactivityDays: action.inactivityDays } },
  )
  if (error) throw error
  return requireSuccess(data)
}

export function useRollingShowActions() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (action: ShowAction) => withMinDuration(runAction(action)),
      onSettled: () => invalidateRollingShows(),
    }),
  )
  const kind = mutation.variables?.kind

  return {
    run: mutation.mutate,
    reset: mutation.reset,
    pending: mutation.isPending,
    errorMessage:
      mutation.isError && kind
        ? mutationErrorMessage(mutation.error, ERROR_FALLBACKS[kind])
        : null,
  }
}
