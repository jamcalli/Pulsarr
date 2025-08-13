import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'

interface ApiKeysDeleteConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSubmitting: boolean
  apiKeyName: string
}

/**
 * Renders a modal dialog that prompts the user to confirm revocation of a specified API key.
 *
 * Displays a warning about the irreversible nature of revoking the API key and disables the confirmation button with a loading state while the revocation is in progress.
 *
 * @param apiKeyName - The name of the API key to be revoked, displayed in the confirmation message.
 */
export function ApiKeysDeleteConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  apiKeyName,
}: ApiKeysDeleteConfirmationModalProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Revoke API Key?
          </CredenzaTitle>
          <CredenzaDescription>
            Are you sure you want to revoke "{apiKeyName}"? This action cannot
            be undone and any applications using this key will immediately lose
            access.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button variant="neutral">Cancel</Button>
            </CredenzaClose>
            <Button
              variant="clear"
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Revoking...' : 'Revoke'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}
