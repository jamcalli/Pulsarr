import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { BulkFormCredenza } from '@/components/bulk-form-credenza'
import { useLinkAccount } from '@/features/system/hooks/plex-connection/useAccountToken'
import {
  TOKEN_FAILURE_MESSAGES,
  type TokenFailure,
} from '@/features/system/lib/plex-connection/plex-requests'
import { useAppForm } from '@/lib/form'

const REVEAL_LABEL = { show: 'Show token', hide: 'Hide token' }

interface TokenCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinked: () => void
}

export function TokenCredenza({
  open,
  onOpenChange,
  onLinked,
}: TokenCredenzaProps) {
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
  const isRejected = failure === 'rejected'
  const busy = link.pending

  const dirty = token !== ''

  return (
    <BulkFormCredenza
      open={open}
      onOpenChange={(next) => {
        if (next) {
          link.reset()
          setFailed(null)
        }
        onOpenChange(next)
      }}
      form={form}
      title="Paste a token"
      description="Pulsarr checks the token with Plex before linking."
      dirty={dirty}
      busy={busy}
      saveBar={{
        errorMessage: link.errorMessage,
        message: busy
          ? 'Verifying with Plex...'
          : failure
            ? TOKEN_FAILURE_MESSAGES[failure]
            : 'Ready to link',
        saveLabel: 'Link account',
        saveDisabled: isRejected,
      }}
    >
      <form.AppField name="token">
        {(field) => (
          <field.SecretField
            label="Plex token"
            orientation="vertical"
            revealLabel={REVEAL_LABEL}
            error={failure ? TOKEN_FAILURE_MESSAGES[failure] : null}
            disabled={busy}
            autoFocus
          />
        )}
      </form.AppField>
    </BulkFormCredenza>
  )
}
