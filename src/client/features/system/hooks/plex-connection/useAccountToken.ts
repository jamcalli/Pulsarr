import { useMutation } from '@tanstack/react-query'
import { clearSyncRun } from '@/features/system/hooks/plex-connection/useWatchlistSync'
import {
  invalidateAccount,
  type TokenFailure,
  tokenSaveFailure,
} from '@/features/system/lib/plex-connection/plex-requests'
import { updateConfig } from '@/hooks/useConfig'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { mutationErrorMessage } from '@/lib/tanstackApi'

type LinkOutcome = { linked: true } | { linked: false; reason: TokenFailure }

/** The config save checks the token with Plex and refuses it before changing anything. */
async function linkToken(token: string): Promise<LinkOutcome> {
  try {
    await updateConfig({ plexTokens: [token] })
    return { linked: true }
  } catch (error) {
    const failure = tokenSaveFailure(error)
    if (failure) return { linked: false, reason: failure }
    throw error
  }
}

export function useLinkAccount() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (token: string) => withMinDuration(linkToken(token)),
    }),
  )

  return {
    link: mutation.mutate,
    reset: mutation.reset,
    idle: mutation.isIdle,
    pending: mutation.isPending,
    outcome: mutation.data ?? null,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The token was not saved. Try again.',
        )
      : null,
  }
}

export function useUnlinkAccount() {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: () => withMinDuration(updateConfig({ plexTokens: [] })),
      onSuccess: () => {
        clearSyncRun()
        return invalidateAccount()
      },
    }),
  )

  return {
    unlink: mutation.mutate,
    reset: mutation.reset,
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The account was not unlinked. Try again.',
        )
      : null,
  }
}
