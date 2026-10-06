import type { ReactNode } from 'react'
import { ApprovalReviewFooter } from '@/components/approval-review/approval-review-footer'
import { ApprovalReviewPanel } from '@/components/approval-review/approval-review-panel'
import {
  ApprovalReviewFooterSkeleton,
  ApprovalReviewSkeleton,
} from '@/components/approval-review/approval-review-skeleton'
import { Credenza, CredenzaContent, CredenzaTitle } from '@/components/credenza'
import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import { useApprovalRequest } from '@/hooks/useApprovalRequest'
import { useApprovalReview } from '@/hooks/useApprovalReview'
import { useGuardedClose } from '@/hooks/useGuardedClose'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

interface ApprovalReviewCredenzaProps {
  approvalId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDecided?: () => void
}

function ReviewBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
      {children}
    </div>
  )
}

function LoadedReview({
  approval,
  onDecided,
  onDirtyChange,
}: {
  approval: ApprovalRequest
  onDecided: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const review = useApprovalReview(approval, { onDecided, onDirtyChange })
  return (
    <>
      <ReviewBody>
        <ApprovalReviewPanel
          approval={approval}
          review={review}
          variant="standalone"
        />
      </ReviewBody>
      {approval.status === 'pending' && (
        <ApprovalReviewFooter review={review} />
      )}
    </>
  )
}

export function ApprovalReviewCredenza({
  approvalId,
  open,
  onOpenChange,
  onDecided,
}: ApprovalReviewCredenzaProps) {
  const { approval, isLoading, errorMessage } = useApprovalRequest(approvalId)
  const guard = useGuardedClose(onOpenChange)
  const handleDecided = () => {
    onDecided?.()
    onOpenChange(false)
  }

  const content = errorMessage ? (
    <ReviewBody>
      <div className="flex flex-col gap-4">
        <CredenzaTitle className="font-heading text-2xl font-bold">
          Approval request
        </CredenzaTitle>
        <ErrorAlert message={errorMessage} />
      </div>
    </ReviewBody>
  ) : approval && !isLoading ? (
    <LoadedReview
      key={approval.id}
      approval={approval}
      onDecided={handleDecided}
      onDirtyChange={guard.setDirty}
    />
  ) : (
    <>
      <ReviewBody>
        <ApprovalReviewSkeleton variant="standalone" />
      </ReviewBody>
      <ApprovalReviewFooterSkeleton />
    </>
  )

  return (
    <>
      <Credenza open={open} onOpenChange={guard.onOpenChange}>
        <CredenzaContent className="flex flex-col gap-0 p-0 md:max-w-2xl [--drawer-content-height:100dvh]">
          {content}
        </CredenzaContent>
      </Credenza>
      <LeaveDialog {...guard.leaveDialog} />
    </>
  )
}
