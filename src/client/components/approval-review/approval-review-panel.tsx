import { ApprovalDecision } from '@/components/approval-review/approval-decision'
import { ApprovalIdentity } from '@/components/approval-review/approval-identity'
import { ApprovalNotes } from '@/components/approval-review/approval-notes'
import { ApprovalRoutingSummary } from '@/components/approval-review/approval-routing-summary'
import { ApprovalTrigger } from '@/components/approval-review/approval-trigger'
import { Separator } from '@/components/ui/separator'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

interface ApprovalReviewPanelProps {
  approval: ApprovalRequest
  review: ApprovalReview
  variant: 'standalone' | 'embedded'
}

export function ApprovalReviewPanel({
  approval,
  review,
  variant,
}: ApprovalReviewPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      {variant === 'standalone' && (
        <>
          <ApprovalIdentity approval={approval} />
          <Separator />
        </>
      )}
      <ApprovalTrigger approval={approval} />
      <Separator />
      <ApprovalRoutingSummary approval={approval} review={review} />
      <Separator />
      {approval.status === 'pending' ? (
        <ApprovalNotes approval={approval} review={review} />
      ) : (
        <ApprovalDecision approval={approval} />
      )}
    </div>
  )
}
