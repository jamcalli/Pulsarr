import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaDescription,
  CredenzaBody,
  CredenzaFooter,
  CredenzaClose,
} from '@/components/ui/credenza'
import { Button } from '@/components/ui/button'

interface ApiKeysDeleteConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSubmitting: boolean
  apiKeyName: string
}

/**
 * Confirmation modal for API key deletion with destructive action warning.
 *
 * Provides a clear warning about the irreversible nature of API key revocation
 * and requires explicit user confirmation before proceeding.
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
