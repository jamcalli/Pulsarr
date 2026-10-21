import { useMutation } from '@tanstack/react-query'
import { invalidateUserQuotas } from '@/features/users/lib/users-queries'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import {
  $api,
  apiFetch,
  loadErrorMessage,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'

async function removeQuotas(userId: number, approveHeld: boolean) {
  const { data, error } = await apiFetch.DELETE('/v1/quota/users/{userId}', {
    params: {
      path: { userId },
      query: { autoApproveHeld: String(approveHeld) },
    },
  })
  if (error) throw error
  requireSuccess(data)
}

/** `approveHeld` approves only the requests the quota holds now. */
export function useRemoveQuotas(userId: number, onRemoved: () => void) {
  const held = $api.useQuery(
    'get',
    '/v1/quota/users/{userId}/pending-held-count',
    { params: { path: { userId } } },
  )
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (approveHeld: boolean) =>
        withMinDuration(removeQuotas(userId, approveHeld)),
      onSuccess: onRemoved,
      onSettled: () => invalidateUserQuotas(userId),
    }),
  )

  return {
    heldCount: held.data ? held.data.movieCount + held.data.showCount : null,
    heldError: loadErrorMessage(
      held,
      "Couldn't load how many requests the quota holds.",
    ),
    remove: mutation.mutate,
    reset: mutation.reset,
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The quotas were not removed. Try again.',
        )
      : null,
  }
}
