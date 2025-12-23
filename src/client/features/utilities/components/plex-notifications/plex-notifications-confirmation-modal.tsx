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

interface PlexNotificationsConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isSubmitting?: boolean
}

/**
 * Displays a modal dialog prompting the user to confirm removal of Plex notifications from all Radarr and Sonarr instances.
 *
 * Provides options to cancel or proceed with the removal. The confirm button is disabled and shows a loading state if a submission is in progress.
 */
export function PlexNotificationsConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: PlexNotificationsConfirmationModalProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Remove Plex Notifications?
          </CredenzaTitle>
          <CredenzaDescription>
            This will remove Plex notifications from all your Radarr and Sonarr
            instances. You'll need to reconfigure them if you want to restore
            this functionality.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button
            variant="clear"
            onClick={async () => {
              await onConfirm()
              onOpenChange(false)
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Remove'}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

export default PlexNotificationsConfirmationModal
