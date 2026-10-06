import { CircleCheck } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApprovalReviewCredenza } from '@/components/approval-review/approval-review-credenza'
import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { ApprovalRow } from '@/features/home/components/approval-row'
import {
  OverflowList,
  OverflowSummarySkeleton,
} from '@/features/home/components/overflow-list'
import { invalidateDashboard } from '@/features/home/hooks/useDashboardInvalidation'
import {
  PENDING_APPROVALS_SHOWN,
  type PendingApproval,
  usePendingApprovals,
} from '@/features/home/hooks/usePendingApprovals'
import type { ApprovalSort } from '@/features/home/lib/home-prefs'
import { formatCount, formatNumber } from '@/lib/format'
import { NAV_PAGES, pageHref } from '@/lib/navigation'

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
] as const satisfies ReadonlyArray<{ value: ApprovalSort; label: string }>

const SKELETON_ROWS = Array.from(
  { length: PENDING_APPROVALS_SHOWN },
  (_, row) => `row-${row}`,
)

function ApprovalRowsSkeleton() {
  return (
    <>
      <ItemGroup className="gap-0">
        {SKELETON_ROWS.map((key, index) => (
          <Fragment key={key}>
            {index > 0 && <ItemSeparator className="my-0" />}
            <Item className="flex-nowrap px-2">
              <ItemMedia>
                <PosterFrameSkeleton size="thumb" />
              </ItemMedia>
              <ItemContent className="gap-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="h-4 w-40 max-w-full" />
              </ItemContent>
              <ItemActions>
                <Skeleton className="size-4" />
              </ItemActions>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
      <OverflowSummarySkeleton />
    </>
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
        <CardTitle className="flex items-center gap-2">
          Needs your approval
          {hasPending && (
            <Badge variant="warn" className="tabular-nums">
              {formatNumber(total)}
            </Badge>
          )}
        </CardTitle>
        <CardAction>
          <Button
            variant="neutral"
            size="sm"
            nativeButton={false}
            render={<Link to={pageHref(NAV_PAGES.approvalQueue)} />}
          >
            {NAV_PAGES.approvalQueue.label}
          </Button>
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
