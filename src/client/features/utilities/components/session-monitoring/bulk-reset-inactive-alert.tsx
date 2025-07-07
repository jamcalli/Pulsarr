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

interface BulkResetInactiveAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  inactiveCount: number
  inactivityDays: number
  isLoading: boolean
}

/**
 * Displays a modal dialog prompting the user to confirm bulk reset of inactive rolling monitored shows.
 *
 * The modal presents destructive action messaging and disables interaction while an operation is in progress. The confirm button invokes the provided callback when clicked.
 *
 * @param inactiveCount - Number of inactive shows that will be reset
 * @param inactivityDays - Number of days threshold for considering shows inactive
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
