import { ApprovalDecision } from '@/components/approval-review/approval-decision'
import { ApprovalNotes } from '@/components/approval-review/approval-notes'
import { ApprovalPrompt } from '@/components/approval-review/approval-prompt'
import { ApprovalRoutingSummary } from '@/components/approval-review/approval-routing-summary'
import { ApprovalTrigger } from '@/components/approval-review/approval-trigger'
import { Separator } from '@/components/ui/separator'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import { DELETE_REQUEST_NOTE } from '@/lib/approval'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

interface ApprovalReviewPanelProps {
  approval: ApprovalRequest
  review: ApprovalReview
}

export function ApprovalReviewPanel({
  approval,
  review,
}: ApprovalReviewPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <ApprovalTrigger approval={approval} />
      <Separator />
      <ApprovalRoutingSummary approval={approval} review={review} />
      {approval.status !== 'pending' && (
        <>
          <Separator />
          <ApprovalDecision approval={approval} />
        </>
      )}
      {review.stage === 'delete' ? (
        <>
          <Separator />
          <ApprovalPrompt
            title="Delete this request?"
            description={DELETE_REQUEST_NOTE}
          />
        </>
      ) : (
        review.editable && (
          <>
            <Separator />
            <ApprovalNotes approval={approval} review={review} />
          </>
        )
      )}
    </div>
  )
}
