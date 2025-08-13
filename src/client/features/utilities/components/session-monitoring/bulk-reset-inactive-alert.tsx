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

interface BulkResetInactiveAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  inactiveCount: number
  inactivityDays: number
  isLoading: boolean
}

/**
 * Renders a modal dialog to confirm bulk resetting of inactive monitored shows.
 *
 * The dialog warns that resetting will revert shows to their original monitoring state, delete excess episode files, and erase all user viewing progress. Interaction is disabled while a reset operation is in progress. The confirm button triggers the provided callback.
 *
 * @param inactiveCount - The number of inactive shows to be reset
 * @param inactivityDays - The inactivity threshold in days for considering shows eligible for reset
 */
export function BulkResetInactiveAlert({
  open,
  onOpenChange,
  onConfirm,
  inactiveCount,
  inactivityDays,
  isLoading,
}: BulkResetInactiveAlertProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Reset All Inactive Shows?
          </CredenzaTitle>
          <CredenzaDescription>
            Are you sure you want to reset {inactiveCount} show
            {inactiveCount !== 1 ? 's' : ''} that{' '}
            {inactiveCount === 1 ? 'has' : 'have'} been inactive for{' '}
            {inactivityDays} day{inactivityDays !== 1 ? 's' : ''} or more? This
            will revert {inactiveCount === 1 ? 'the show' : 'all shows'} to
            their original monitoring state (pilot-only or first-season-only)
            and delete any excess episode files. All user viewing progress will
            be lost.
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
              variant="default"
              onClick={() => {
                onConfirm()
              }}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Reset {inactiveCount} Show{inactiveCount !== 1 ? 's' : ''}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}
