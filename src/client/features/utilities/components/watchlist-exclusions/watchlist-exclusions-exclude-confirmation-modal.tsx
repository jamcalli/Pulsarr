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

interface WatchlistExclusionsExcludeConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isSubmitting: boolean
  title: string
  username: string
  status: string
}

/**
 * Renders a modal dialog that prompts the user to confirm creating a watchlist exclusion.
 *
 * Warns when the item is already in the library that the next Delete Sync run will remove it.
 */
export function WatchlistExclusionsExcludeConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  title,
  username,
  status,
}: WatchlistExclusionsExcludeConfirmationModalProps) {
  const isInLibrary = status === 'grabbed' || status === 'notified'

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Exclude this item?
          </CredenzaTitle>
          <CredenzaDescription>
            {isInLibrary
              ? `This will block "${title}" from being routed for ${username}. "${title}" is already in your library, so the next Delete Sync run will remove it.`
              : `This will block "${title}" from being routed for ${username} on future sync cycles.`}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button variant="clear" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Excluding...' : 'Exclude'}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
