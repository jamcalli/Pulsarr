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
import { Loader2 } from 'lucide-react'

interface RollingShowActionAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  showTitle: string
  action: 'reset' | 'delete'
  isLoading: boolean
}

/**
 * Renders a confirmation modal for resetting or removing a show from rolling monitoring.
 *
 * The modal displays action-specific titles and descriptions based on whether the user is resetting the show to its original monitoring state or removing it from rolling monitoring. The confirm button triggers the provided callback and shows a loading spinner when an operation is in progress.
 *
 * @param showTitle - The title of the show affected by the action.
 * @param action - The action to confirm, either 'reset' or 'delete'.
 */
export function RollingShowActionAlert({
  open,
  onOpenChange,
  onConfirm,
  showTitle,
  action,
  isLoading,
}: RollingShowActionAlertProps) {
  const isReset = action === 'reset'

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-text">
            {isReset
              ? 'Reset Show to Original State?'
              : 'Remove from Rolling Monitoring?'}
          </CredenzaTitle>
          <CredenzaDescription>
            {isReset
              ? `Are you sure you want to reset "${showTitle}" to its original monitoring state? This will revert the show to pilot-only or first-season-only monitoring and delete any excess episode files.`
              : `Are you sure you want to remove "${showTitle}" from rolling monitoring? This will stop Pulsarr from tracking this show's viewing progress. The show will remain in Sonarr with its current monitoring settings.`}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button variant="neutral" disabled={isLoading}>
                Cancel
              </Button>
            </CredenzaClose>
            <Button
              variant={isReset ? 'default' : 'clear'}
              onClick={() => {
                onConfirm()
              }}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isReset ? 'Reset' : 'Remove'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}
