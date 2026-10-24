import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { invalidatePlexUsers } from '@/features/users/lib/users-queries'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import {
  apiFetch,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'

async function cancelFriend(uuid: string) {
  const { data, error } = await apiFetch.POST(
    '/v1/plex/cancel-friend-request',
    { body: { uuid } },
  )
  if (error) throw error
  requireSuccess(data)
}

export function useRemoveFriend() {
  const navigate = useNavigate()
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (uuid: string) => withMinDuration(cancelFriend(uuid)),
      onSuccess: () => {
        void invalidatePlexUsers()
        navigate(pageHref(NAV_PAGES.plexUsers))
      },
    }),
  )

  return {
    remove: mutation.mutate,
    reset: mutation.reset,
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The friend was not removed. Try again.',
        )
      : null,
  }
}
