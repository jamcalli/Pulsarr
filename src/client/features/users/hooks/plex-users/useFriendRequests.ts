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

/** A resend whose cancel went through but whose new request failed. */
class ResendNotSent {}

const ERROR_FALLBACKS: Record<FriendAction, string> = {
  send: 'The friend request was not sent. Try again.',
  cancel: 'The friend request was not cancelled. Try again.',
  resend: 'The friend request was not sent. Try again.',
}

const RESEND_NOT_SENT =
  'The old request was cancelled, but the new one was not sent. Send it again.'

async function run({ action, uuid }: FriendRequest) {
  if (action === 'send') return send(uuid)
  await cancel(uuid)
  if (action === 'cancel') return
  try {
    await send(uuid)
  } catch {
    throw new ResendNotSent()
  }
}

function errorMessage(error: unknown, action: FriendAction): string {
  if (error instanceof ResendNotSent) return RESEND_NOT_SENT
  return mutationErrorMessage(error, ERROR_FALLBACKS[action])
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
    errorMessage:
      mutation.isError && mutation.variables
        ? errorMessage(mutation.error, mutation.variables.action)
        : null,
  }
}
