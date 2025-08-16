import { Loader2 } from 'lucide-react'
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

interface RollingShowActionAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  showTitle: string
  action: 'reset' | 'delete'
  isLoading: boolean
}

/**
 * Displays a modal dialog prompting the user to confirm resetting or removing a show from rolling monitoring.
 *
 * The modal presents action-specific messaging and disables interaction while an operation is in progress. The confirm button invokes the provided callback when clicked.
 *
 * @param showTitle - The name of the show being acted upon.
 * @param action - Specifies whether the action is 'reset' or 'delete'.
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
          <CredenzaTitle className="text-foreground">
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
