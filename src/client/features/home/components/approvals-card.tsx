import { CircleCheck } from 'lucide-react'
import { Fragment, useState } from 'react'
import { ApprovalReviewCredenza } from '@/components/approval-review/approval-review-credenza'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CardTitleCount } from '@/components/card-title-count'
import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { NavPageButton } from '@/components/nav-page-button'
import { ItemRowsSkeleton } from '@/components/request-list/item-rows-skeleton'
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card'
import { ItemGroup, ItemSeparator } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { ApprovalRow } from '@/features/home/components/approval-row'
import {
  OverflowList,
  OverflowSummarySkeleton,
} from '@/features/home/components/overflow-list'
import {
  PENDING_APPROVALS_SHOWN,
  type PendingApproval,
  usePendingApprovals,
} from '@/features/home/hooks/usePendingApprovals'
import type { ApprovalSort } from '@/features/home/lib/home-prefs'
import { invalidateDashboard } from '@/lib/dashboard-invalidation'
import { formatCount, formatNumber } from '@/lib/format'
import { NAV_PAGES } from '@/lib/navigation'

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
] as const satisfies ReadonlyArray<{ value: ApprovalSort; label: string }>

function ApprovalRowsSkeleton() {
  return (
    <>
      <ItemRowsSkeleton
        count={PENDING_APPROVALS_SHOWN}
        action={<Skeleton className="size-4" />}
      />
      <OverflowSummarySkeleton />
    </>
  )
}

export function ApprovalsCardSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton badge action={<Skeleton className="h-8 w-28" />} />
      <CardContent className="flex-1 gap-4">
        <ApprovalRowsSkeleton />
      </CardContent>
    </Card>
  )
}

function ApprovalRows({
  requests,
  onReview,
}: {
  requests: PendingApproval[]
  onReview: (id: number) => void
}) {
  return (
    <ItemGroup className="gap-0">
      {requests.map((request, index) => (
        <Fragment key={request.id}>
          {index > 0 && <ItemSeparator className="my-0" />}
          <ApprovalRow
            approval={request}
            onReview={() => onReview(request.id)}
          />
        </Fragment>
      ))}
    </ItemGroup>
  )
}

export function ApprovalsCard() {
  const { sort, setSort, requests, total, isLoading, errorMessage } =
    usePendingApprovals()
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const hasPending = requests !== undefined && total > 0
  const hiddenSummary = `+${formatNumber(total - PENDING_APPROVALS_SHOWN)} more waiting`

  const openReview = (id: number) => {
    setReviewId(id)
    setReviewOpen(true)
  }

  const content = errorMessage ? (
    <ErrorAlert message={errorMessage} />
  ) : isLoading ? (
    <ApprovalRowsSkeleton />
  ) : requests === undefined ? null : requests.length === 0 ? (
    <p className="flex items-center gap-2 text-muted-foreground">
      <CircleCheck className="size-4 shrink-0 text-ok" />
      All caught up. Requests that need a decision will land here.
    </p>
  ) : (
    <OverflowList
      rows={requests}
      visible={PENDING_APPROVALS_SHOWN}
      summary={() => hiddenSummary}
      title="Needs your approval"
      description={`${formatCount(total, 'request')} waiting`}
      renderRows={(rows) => (
        <ApprovalRows requests={rows} onReview={openReview} />
      )}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitleCount
          title="Needs your approval"
          count={total}
          tone="pending"
        />
        <CardAction>
          <NavPageButton page={NAV_PAGES.approvalQueue} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 gap-4">
        {hasPending && (
          <div className="flex flex-wrap items-center gap-2">
            <CompactSelect
              label="Sort order"
              value={sort}
              options={SORT_OPTIONS}
              onValueChange={setSort}
            />
          </div>
        )}
        {content}
      </CardContent>
      <ApprovalReviewCredenza
        approvalId={reviewId}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onDecided={invalidateDashboard}
      />
    </Card>
  )
}
