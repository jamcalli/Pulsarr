import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLinkAccount } from '@/hooks/plex/useAccountToken'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { PIN_POLL_INTERVAL_MS, pinPhase } from '@/lib/plex/plex-pin'
import { TOKEN_FAILURE_MESSAGES } from '@/lib/plex/plex-requests'
import {
  $api,
  apiFetch,
  loadErrorMessage,
  mutationErrorMessage,
} from '@/lib/tanstackApi'

const NO_ANSWER = 'Plex did not answer.'
const LINK_FAILED = "Couldn't link your account."

async function createPin() {
  const { data, error } = await apiFetch.POST('/v1/plex/pin')
  if (error) throw error
  return data
}

/** Asks Plex for a code while `open`, polls it until approved or expired, then links the token. */
export function usePlexPin(open: boolean, onLinked: () => void) {
  const create = useMinLoadingMutation(
    useMutation({ mutationFn: () => withMinDuration(createPin()) }),
  )
  const link = useLinkAccount()
  const pin = create.data ?? null
  const poll = $api.useQuery(
    'get',
    '/v1/plex/pin/{pinId}',
    {
      params: {
        path: { pinId: pin?.id ?? 0 },
        query: { clientId: pin?.clientId ?? '' },
      },
    },
    {
      enabled: open && pin !== null,
      refetchInterval: (query) =>
        query.state.data?.authToken || (query.state.data?.expiresIn ?? 1) <= 0
          ? false
          : PIN_POLL_INTERVAL_MS,
      gcTime: 0,
      meta: { silentRefresh: true },
    },
  )
  const authToken = poll.data?.authToken ?? null
  const { reset: resetCreate, mutate: requestPin } = create
  const { reset: resetLink, link: linkToken, idle: linkIdle } = link

  useEffect(() => {
    if (open) requestPin()
    else {
      resetCreate()
      resetLink()
    }
  }, [open, requestPin, resetCreate, resetLink])

  useEffect(() => {
    if (!open || !authToken || !linkIdle) return
    linkToken(authToken, {
      onSuccess: (outcome) => {
        if (outcome.linked) onLinked()
      },
    })
  }, [open, authToken, linkIdle, linkToken, onLinked])

  const pollError = loadErrorMessage(poll, NO_ANSWER)
  const failure = create.isError
    ? {
        title: "Couldn't get a code from Plex.",
        detail: mutationErrorMessage(create.error, NO_ANSWER),
      }
    : pollError
      ? { title: "Couldn't check the code with Plex.", detail: pollError }
      : link.errorMessage
        ? { title: LINK_FAILED, detail: link.errorMessage }
        : link.outcome && !link.outcome.linked
          ? {
              title: LINK_FAILED,
              detail: TOKEN_FAILURE_MESSAGES[link.outcome.reason],
            }
          : null

  return {
    pin,
    phase: pinPhase({
      failed: failure !== null,
      hasPin: pin !== null,
      authToken,
      expiresIn: poll.data?.expiresIn ?? null,
    }),
    failure,
    newCode: () => {
      resetLink()
      requestPin()
    },
  }
}
