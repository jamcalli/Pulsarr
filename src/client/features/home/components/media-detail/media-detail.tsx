import { cn } from 'cn'
import { SearchX } from 'lucide-react'
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { MediaAbout } from '@/features/home/components/media-detail/media-about'
import {
  MediaBackdrop,
  MediaHero,
  MediaHeroSkeleton,
} from '@/features/home/components/media-detail/media-hero'
import { PulsarrContext } from '@/features/home/components/media-detail/pulsarr-context'
import { invalidateDashboard } from '@/features/home/hooks/useDashboardInvalidation'
import { useMediaDetail } from '@/features/home/hooks/useMediaDetail'
import { usePendingApprovalFor } from '@/features/home/hooks/usePendingApprovalFor'
import { mediaContext } from '@/features/home/lib/media-context'
import { type MediaItem, metadataGuid } from '@/features/home/lib/media-item'
import { useApprovalReview } from '@/hooks/useApprovalReview'
import { useGuardedClose } from '@/hooks/useGuardedClose'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { backdropUrl } from '@/lib/poster-url'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

const PAD = 'p-4 md:p-6'
const GRID =
  'grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'
const PANEL_CARD = 'min-w-0 rounded-lg border-2 border-border p-4'

interface MediaDetailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: MediaItem
}

function AboutSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="grid grid-cols-2 gap-3 pt-2">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    </div>
  )
}

function NoDetails() {
  return (
    <Empty className="border p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>No details available</EmptyTitle>
        <EmptyDescription>
          TMDB doesn't have a single entry for this title, so ratings, synopsis
          and streaming info can't be shown.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

interface MediaBodyProps {
  item: MediaItem
  open: boolean
  approval: ApprovalRequest | null
  panel?: ReactNode
}

function MediaBody({ item, open, approval, panel }: MediaBodyProps) {
  const { metadata, notFound, errorMessage } = useMediaDetail({
    open,
    guid: metadataGuid(item),
    type: item.type,
  })
  const backdrop = metadata ? backdropUrl(metadata.details.backdrop_path) : null
  const { lookup } = useUserDirectory()
  const context = mediaContext({
    displayName: (username) => lookup(username).name,
    request: item.request,
    watchers: item.watchers,
    approval,
  })
  const journey = <PulsarrContext context={context} />

  const about = errorMessage ? null : metadata ? (
    <MediaAbout metadata={metadata} />
  ) : notFound ? (
    <NoDetails />
  ) : (
    <AboutSkeleton />
  )

  const details = panel ? (
    <div className={cn('flex flex-col gap-6', PAD)}>
      <div className={GRID}>
        {journey}
        <section className={PANEL_CARD}>{panel}</section>
      </div>
      {about}
    </div>
  ) : about ? (
    <div className={cn(GRID, PAD)}>
      {journey}
      {about}
    </div>
  ) : (
    <div className={PAD}>{journey}</div>
  )

  const header = errorMessage ? (
    <div className="flex flex-col gap-4 px-4 pt-4 md:px-6 md:pt-6">
      <CredenzaTitle className="font-heading text-2xl font-bold">
        {item.title}
      </CredenzaTitle>
      <ErrorAlert message={errorMessage} />
    </div>
  ) : metadata || notFound ? (
    <MediaHero item={item} metadata={metadata} />
  ) : (
    <MediaHeroSkeleton title={item.title} />
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      {backdrop && <MediaBackdrop src={backdrop} />}
      <div className="relative flex flex-col">
        {header}
        {details}
      </div>
    </div>
  )
}

function ReviewedMediaBody({
  item,
  open,
  approval,
  onDecided,
  onDirtyChange,
}: {
  item: MediaItem
  open: boolean
  approval: ApprovalRequest
  onDecided: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const review = useApprovalReview(approval, { onDecided, onDirtyChange })
  return (
    <>
      <MediaBody
        item={item}
        open={open}
        approval={approval}
        panel={
          <ApprovalReviewPanel
            approval={approval}
            review={review}
            variant="embedded"
          />
        }
      />
      {approval.status === 'pending' && (
        <ApprovalReviewFooter review={review} />
      )}
    </>
  )
}

export function MediaDetail({ open, onOpenChange, item }: MediaDetailProps) {
  const pending = usePendingApprovalFor(item)
  const guard = useGuardedClose(onOpenChange)
  const onDecided = () => {
    onOpenChange(false)
    void invalidateDashboard()
  }

  const content = pending.errorMessage ? (
    <MediaBody
      item={item}
      open={open}
      approval={null}
      panel={<ErrorAlert message={pending.errorMessage} />}
    />
  ) : pending.approval ? (
    <ReviewedMediaBody
      key={pending.approval.id}
      item={item}
      open={open}
      approval={pending.approval}
      onDecided={onDecided}
      onDirtyChange={guard.setDirty}
    />
  ) : pending.approvalId !== null ? (
    <>
      <MediaBody
        item={item}
        open={open}
        approval={null}
        panel={<ApprovalReviewSkeleton variant="embedded" />}
      />
      <ApprovalReviewFooterSkeleton />
    </>
  ) : (
    <MediaBody item={item} open={open} approval={null} />
  )

  return (
    <>
      <Credenza open={open} onOpenChange={guard.onOpenChange}>
        <CredenzaContent
          fullHeight
          floatingHandle
          className="gap-0 p-0 md:max-w-5xl"
        >
          {content}
        </CredenzaContent>
      </Credenza>
      <LeaveDialog {...guard.leaveDialog} />
    </>
  )
}
