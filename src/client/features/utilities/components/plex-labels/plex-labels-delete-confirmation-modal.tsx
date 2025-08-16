import { AlertTriangle } from 'lucide-react'
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

interface PlexLabelsDeleteConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isSubmitting?: boolean
}

/**
 * Displays a modal dialog for confirming the removal of Pulsarr-created labels from Plex server content.
 *
 * Provides options to cancel or confirm the removal. The confirm button shows a processing state and is disabled while the removal action is in progress.
 */
export function PlexLabelsDeleteConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: PlexLabelsDeleteConfirmationModalProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Remove Pulsarr Labels?
          </CredenzaTitle>
          <CredenzaDescription>
            This will remove Pulsarr-created labels from content in your Plex
            server.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md mb-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              Labels created by Pulsarr will be removed from all media items in
              Plex. This won't affect the content itself or labels created by
              other sources, only the Pulsarr watchlist labels.
            </p>
          </div>

          <CredenzaFooter className="mt-6">
            <CredenzaClose asChild>
              <Button variant="neutral">Cancel</Button>
            </CredenzaClose>
            <Button
              variant="clear"
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Remove Pulsarr Labels'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}

export default PlexLabelsDeleteConfirmationModal
