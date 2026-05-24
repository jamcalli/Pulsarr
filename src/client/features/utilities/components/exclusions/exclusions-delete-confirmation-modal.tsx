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

interface ExclusionsDeleteConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isSubmitting: boolean
  username: string
}

/**
 * Renders a modal dialog that prompts the user to confirm removal of a watchlist exclusion.
 *
 * Explains that removing the exclusion will allow the item to be re-requested during the next sync cycle if it remains on the user's watchlist.
 */
export function ExclusionsDeleteConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  username,
}: ExclusionsDeleteConfirmationModalProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Remove Exclusion?
          </CredenzaTitle>
          <CredenzaDescription>
            Are you sure you want to remove this exclusion for {username}? If
            this item is still on their watchlist, it will be re-requested
            during the next sync cycle.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button variant="clear" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Removing...' : 'Remove'}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
