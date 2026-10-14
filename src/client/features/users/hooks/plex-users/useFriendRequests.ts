import { useMutation } from '@tanstack/react-query'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { plexUserStatusKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import {
  apiFetch,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'

export type FriendAction = 'send' | 'cancel' | 'resend'

interface FriendRequest {
  action: FriendAction
  uuid: string
}

async function send(uuid: string) {
  const { data, error } = await apiFetch.POST('/v1/plex/send-friend-request', {
    body: { uuid },
  })
  if (error) throw error
  requireSuccess(data)
}

async function cancel(uuid: string) {
  const { data, error } = await apiFetch.POST(
    '/v1/plex/cancel-friend-request',
    { body: { uuid } },
  )
  if (error) throw error
  requireSuccess(data)
}

async function run({ action, uuid }: FriendRequest) {
  if (action !== 'send') await cancel(uuid)
  if (action !== 'cancel') await send(uuid)
}

export function useFriendRequests() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (request: FriendRequest) => withMinDuration(run(request)),
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: plexUserStatusKeys.all }),
    }),
  )

  return {
    run: (action: FriendAction, uuid: string) =>
      mutation.mutate({ action, uuid }),
    /** The request in flight, held at least the minimum loading time. */
    running: mutation.isPending ? (mutation.variables ?? null) : null,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The friend request was not sent. Try again.',
        )
      : null,
  }
}
