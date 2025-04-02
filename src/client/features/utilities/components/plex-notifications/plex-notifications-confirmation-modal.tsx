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

interface PlexNotificationsConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSubmitting?: boolean
}

/**
 * Renders a confirmation modal for removing Plex notifications.
 *
 * This modal displays a message to confirm the user's intention to remove Plex notifications
 * from all Radarr and Sonarr instances. It provides buttons to either proceed with the removal
 * or cancel the operation.
 *
 * @param open - Controls whether the modal is visible.
 * @param onOpenChange - Callback to update the modal's open state.
 * @param onConfirm - Callback invoked when the user confirms the deletion.
 * @param isSubmitting - Optional flag that, when true, disables the confirm button during submission.
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
          <CredenzaTitle className="text-text">
            Remove Plex Notifications?
          </CredenzaTitle>
          <CredenzaDescription>
            This will remove Plex notifications from all your Radarr and Sonarr
            instances. You'll need to reconfigure them if you want to restore
            this functionality.
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
              {isSubmitting ? 'Processing...' : 'Remove'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}

export default PlexNotificationsConfirmationModal
