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
import { AlertTriangle } from 'lucide-react'

interface DeleteSyncConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  mode: 'enable' | 'run'
  isSubmitting?: boolean
}

/**
 * Renders a confirmation modal for delete synchronization actions.
 *
 * The modal dynamically updates its title, description, and confirmation button label based on the provided mode. In "enable" mode, it warns about enabling automatic deletion sync, whereas in "run" mode, it prompts to immediately run the delete sync process.
 *
 * A warning message advises that proceeding may result in irreversible removal of items from the library and recommends a dry run to verify the impact. The cancel button closes the modal, while the confirm button triggers the provided onConfirm callback. The confirm button is disabled and displays a "Processing..." label when a submission is in progress.
 *
 * @param open - Controls whether the modal is visible.
 * @param onOpenChange - Callback to update the modal's open state.
 * @param onConfirm - Callback invoked when the user confirms the action; expected to return a Promise.
 * @param mode - Determines the modal context; "enable" for enabling delete sync and "run" for executing it immediately.
 * @param isSubmitting - Optional flag that, when true, disables the confirm button during a submission.
 */
export function DeleteSyncConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  mode,
  isSubmitting = false,
}: DeleteSyncConfirmationModalProps) {
  const title =
    mode === 'enable' ? 'Enable Delete Sync?' : 'Run Delete Sync Now?'

  const description =
    mode === 'enable'
      ? 'This will enable automatic deletion of content that is no longer on any watchlists. Are you sure you want to proceed?'
      : 'This will immediately run the content deletion process. Are you sure you want to proceed?'

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {title}
          </CredenzaTitle>
          <CredenzaDescription>{description}</CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md mb-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              This action may cause{' '}
              <span className="font-bold">irreversible removal</span> of items
              from your library. It is strongly recommended to run a dry run
              first to verify what content will be affected by your current
              settings.
            </p>
          </div>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button variant="neutral">Cancel</Button>
            </CredenzaClose>
            <Button
              variant="clear"
              onClick={() => {
                onConfirm()
              }}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Processing...'
                : mode === 'enable'
                  ? 'Enable'
                  : 'Run Now'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}

export default DeleteSyncConfirmationModal
