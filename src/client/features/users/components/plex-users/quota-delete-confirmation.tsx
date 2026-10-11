import { AlertTriangle } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

interface QuotaDeleteConfirmationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (autoApprove: boolean) => Promise<void>
  pendingCount: { movieCount: number; showCount: number }
  isSubmitting?: boolean
}

/**
 * Displays a confirmation modal when an admin removes quotas for a user who has
 * pending held requests. Offers the choice to also auto-approve held items or
 * leave them pending until the next scheduled maintenance.
 */
export function QuotaDeleteConfirmation({
  open,
  onOpenChange,
  onConfirm,
  pendingCount,
  isSubmitting = false,
}: QuotaDeleteConfirmationProps) {
  const [autoApproveHeld, setAutoApproveHeld] = useState(false)
  const autoApproveId = useId()

  const parts: string[] = []
  if (pendingCount.movieCount > 0) {
    parts.push(
      `${pendingCount.movieCount} movie${pendingCount.movieCount !== 1 ? 's' : ''}`,
    )
  }
  if (pendingCount.showCount > 0) {
    parts.push(
      `${pendingCount.showCount} show${pendingCount.showCount !== 1 ? 's' : ''}`,
    )
  }
  const countDescription = parts.join(' and ')

  const handleConfirm = async () => {
    try {
      await onConfirm(autoApproveHeld)
    } finally {
      onOpenChange(false)
    }
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Remove Quota?
          </CredenzaTitle>
          <CredenzaDescription>
            This user has {countDescription} currently held by quota limits.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md mb-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              Removing quotas will leave these requests pending. If auto-approve
              on quota available is enabled, they will be routed at the next
              maintenance cycle. Otherwise, they will require manual approval.
            </p>
          </div>

          <div className="flex items-center space-x-2 mt-4">
            <Checkbox
              id={autoApproveId}
              checked={autoApproveHeld}
              onCheckedChange={(checked) => setAutoApproveHeld(!!checked)}
            />
            <label
              htmlFor={autoApproveId}
              className="text-sm font-medium text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Also approve held requests immediately
            </label>
          </div>
          <p className="text-xs text-foreground mt-1 ml-6">
            When enabled, all pending held requests for this user will be
            approved and routed immediately instead of waiting for the next
            maintenance cycle.
          </p>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button
            variant="clear"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Remove Quota'}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

export default QuotaDeleteConfirmation
