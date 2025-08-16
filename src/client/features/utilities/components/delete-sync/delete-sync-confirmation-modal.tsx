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

interface DeleteSyncConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  mode: 'enable' | 'run'
  isSubmitting?: boolean
}

/**
 * Displays a modal dialog prompting the user to confirm enabling or running delete synchronization.
 *
 * The modal warns about the potential for irreversible removal of items and recommends performing a dry run before proceeding. The title, description, and confirmation button label adjust based on whether the action is to enable delete sync or run it immediately.
 *
 * @param open - Whether the modal is visible.
 * @param onOpenChange - Callback to update the modal's open state.
 * @param onConfirm - Invoked when the user confirms the action.
 * @param mode - Specifies if the modal is for enabling delete sync ("enable") or running it immediately ("run").
 * @param isSubmitting - Optional; disables the confirm button and shows a processing state when true.
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
