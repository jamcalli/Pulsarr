import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'

interface RemoveTokenConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isSubmitting: boolean
}

/**
 * Renders a modal dialog that prompts the user to confirm removal of their Plex token.
 *
 * Displays a warning about the consequences of removing the token and disables
 * the confirmation button with a loading state while the removal is in progress.
 */
export function RemoveTokenConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: RemoveTokenConfirmationModalProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Remove Plex Token?
          </CredenzaTitle>
          <CredenzaDescription>
            Are you sure you want to remove your Plex token? This will
            disconnect Pulsarr from your Plex account and you will need to
            re-authenticate to restore functionality.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button
            variant="clear"
            onClick={async () => {
              try {
                await onConfirm()
              } finally {
                onOpenChange(false)
              }
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Removing...' : 'Remove'}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
