import { BusyLabel } from '@/components/busy-label'
import { CredenzaFooter } from '@/components/credenza'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import type { ApprovalReview } from '@/hooks/useApprovalReview'

export function ApprovalReviewFooter({ review }: { review: ApprovalReview }) {
  const locked = review.busy !== null
  const blockedReason =
    review.stage === 'deny' ? null : review.approveBlockedReason

  const actions =
    review.stage === 'deny' ? (
      <>
        <Button variant="outline" disabled={locked} onClick={review.cancelDeny}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={locked} onClick={review.deny}>
          <BusyLabel
            busy={review.busy === 'deny'}
            label="Deny request"
            busyLabel="Denying..."
          />
        </Button>
      </>
    ) : (
      <>
        <Button variant="outline" disabled={locked} onClick={review.startDeny}>
          Deny
        </Button>
        <Button disabled={!review.canApprove} onClick={review.approve}>
          <BusyLabel
            busy={review.busy === 'approve'}
            label="Approve"
            busyLabel="Approving..."
          />
        </Button>
      </>
    )

  return (
    <>
      {review.errorMessage && (
        <div className="px-4 pb-2 md:px-6">
          <ErrorAlert message={review.errorMessage} />
        </div>
      )}
      {blockedReason && (
        <p className="px-4 pb-2 text-sm text-muted-foreground md:px-6 md:text-right">
          {blockedReason}
        </p>
      )}
      <CredenzaFooter className="md:px-6 md:pb-6">{actions}</CredenzaFooter>
    </>
  )
}
