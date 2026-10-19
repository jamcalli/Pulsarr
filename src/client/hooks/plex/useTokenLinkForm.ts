import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { useLinkAccount } from '@/hooks/plex/useAccountToken'
import { useAppForm } from '@/lib/form'
import {
  TOKEN_FAILURE_MESSAGES,
  type TokenFailure,
} from '@/lib/plex/plex-requests'

export function useTokenLinkForm(onLinked: () => void) {
  const link = useLinkAccount()
  const [failed, setFailed] = useState<{
    token: string
    reason: TokenFailure
  } | null>(null)
  const form = useAppForm({
    defaultValues: { token: '' },
    onSubmit: ({ value }) => {
      const token = value.token.trim()
      link.link(token, {
        onSuccess: (outcome) => {
          if (outcome.linked) onLinked()
          else setFailed({ token, reason: outcome.reason })
        },
      })
    },
  })
  const token = useStore(form.store, (state) => state.values.token.trim())
  const failure = failed?.token === token ? failed.reason : null
  const busy = link.pending

  return {
    form,
    busy,
    failure,
    isRejected: failure === 'rejected',
    dirty: token !== '',
    message: busy
      ? 'Verifying with Plex...'
      : failure
        ? TOKEN_FAILURE_MESSAGES[failure]
        : 'Ready to link',
    errorMessage: link.errorMessage,
    reset: () => {
      link.reset()
      setFailed(null)
    },
  }
}

export type TokenLinkForm = ReturnType<typeof useTokenLinkForm>
