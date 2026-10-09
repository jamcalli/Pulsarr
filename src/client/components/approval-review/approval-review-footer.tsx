import { Trash2 } from 'lucide-react'
import { BusyLabel } from '@/components/busy-label'
import { CredenzaFooter } from '@/components/credenza'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import type { ApprovalReview } from '@/hooks/useApprovalReview'

export function ApprovalReviewFooter({ review }: { review: ApprovalReview }) {
  const locked = review.busy !== null
  const showApproveHint =
    review.approvable && (review.stage === 'review' || review.stage === 'edit')
  const note = showApproveHint ? review.approveBlockedReason : null

  const actions =
    review.stage === 'delete' ? (
      <>
        <Button
          variant="outline"
          disabled={locked}
          onClick={review.cancelDelete}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={locked}
          onClick={review.deleteRequest}
        >
          <BusyLabel
            busy={review.busy === 'delete'}
            label="Delete request"
            busyLabel="Deleting..."
          />
        </Button>
      </>
    ) : review.stage === 'deny' ? (
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
        <Button
          variant="ghost"
          className="md:mr-auto"
          disabled={locked || review.stage === 'edit'}
          onClick={review.startDelete}
        >
          <Trash2
            data-icon="inline-start"
            aria-hidden
            className="text-destructive-text"
          />
          Delete
        </Button>
        {review.canDeny && (
          <Button
            variant="outline"
            disabled={locked}
            onClick={review.startDeny}
          >
            Deny
          </Button>
        )}
        {review.approvable && (
          <Button disabled={!review.canApprove} onClick={review.approve}>
            <BusyLabel
              busy={review.busy === 'approve'}
              label="Approve"
              busyLabel="Approving..."
            />
          </Button>
        )}
      </>
    )

  return (
    <>
      {review.errorMessage && (
        <div className="px-4 pb-2 md:px-6">
          <ErrorAlert message={review.errorMessage} />
        </div>
      )}
      {note && (
        <p className="px-4 pb-2 text-sm text-muted-foreground md:px-6 md:text-right">
          {note}
        </p>
      )}
      <CredenzaFooter className="md:px-6 md:pb-6">{actions}</CredenzaFooter>
    </>
  )
}
