import { BulkFormCredenza } from '@/components/bulk-form-credenza'
import { TokenField } from '@/components/plex/token-field'
import { useTokenLinkForm } from '@/hooks/plex/useTokenLinkForm'

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
  const link = useTokenLinkForm(onLinked)

  return (
    <BulkFormCredenza
      open={open}
      onOpenChange={(next) => {
        if (next) link.reset()
        onOpenChange(next)
      }}
      form={link.form}
      title="Paste a token"
      description="Pulsarr checks the token with Plex before linking."
      dirty={link.dirty}
      busy={link.busy}
      saveBar={{
        errorMessage: link.errorMessage,
        message: link.message,
        saveLabel: 'Link account',
        saveDisabled: link.isRejected,
      }}
    >
      <TokenField link={link} />
    </BulkFormCredenza>
  )
}
