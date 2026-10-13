import { RecentRequestStatusSchema } from '@root/schemas/shared/recent-request.schema'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { ItemButton } from '@/components/item-button'
import { PosterCard } from '@/components/poster-card'
import { PosterFrame } from '@/components/poster-frame'
import { PosterRow, PosterRowSkeleton } from '@/components/poster-row'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { CardHeaderSkeleton } from '@/features/home/components/card-header-skeleton'
import { ItemRowsSkeleton } from '@/features/home/components/item-rows-skeleton'
import { MediaDetail } from '@/features/home/components/media-detail/media-detail'
import { RequestStatus } from '@/features/home/components/request-status'
import { ViewToggle } from '@/features/home/components/view-toggle'
import { useMediaSelection } from '@/features/home/hooks/useMediaSelection'
import { usePrefetchMediaDetail } from '@/features/home/hooks/usePrefetchMediaDetail'
import type {
  RecentRequest,
  RecentRequestsState,
} from '@/features/home/hooks/useRecentRequests'
import {
  type MediaView,
  RECENT_LIMITS,
  type RecentStatus,
  recentLimitPref,
  recentViewPref,
} from '@/features/home/lib/home-prefs'
import { recentRequestItem } from '@/features/home/lib/media-item'
import { REQUEST_STATUS_LABELS } from '@/features/home/lib/request-labels'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatCount, formatList, formatRelative } from '@/lib/format'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { usePref } from '@/lib/prefs'

const STATUS_FILTERS: ReadonlyArray<{ value: RecentStatus; label: string }> = [
  { value: 'all', label: 'All' },
  ...RecentRequestStatusSchema.options.map((value) => ({
    value,
    label: REQUEST_STATUS_LABELS[value],
  })),
]

const LIMIT_OPTIONS = RECENT_LIMITS.map((limit) => ({
  value: limit,
  label: formatCount(limit, 'item'),
}))

function requestedBy(item: RecentRequest, userName: string): string {
  return `${userName}, ${formatRelative(new Date(item.createdAt))}`
}

interface RequestViewProps {
  items: RecentRequest[]
  onSelect: (item: RecentRequest) => void
  onIntent: (item: RecentRequest) => void
}

function RequestList({ items, onSelect, onIntent }: RequestViewProps) {
  const { lookup } = useUserDirectory()
  return (
    <ItemGroup className="gap-0">
      {items.map((item, index) => (
        <Fragment key={`${item.source}-${item.id}`}>
          {index > 0 && <ItemSeparator className="my-0" />}
          <ItemButton
            onClick={() => onSelect(item)}
            onIntent={() => onIntent(item)}
          >
            <ItemMedia>
              <PosterFrame
                size="thumb"
                thumb={item.thumb}
                type={item.contentType}
              />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{item.title}</ItemTitle>
              <ItemDescription>
                {requestedBy(item, lookup(item.userName).name)}
              </ItemDescription>
              {item.allInstances.length > 0 && (
                <ItemDescription className="line-clamp-1">
                  {formatList(
                    item.allInstances.map((instance) => instance.name),
                  )}
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions>
              <RequestStatus status={item.status} />
            </ItemActions>
          </ItemButton>
        </Fragment>
      ))}
    </ItemGroup>
  )
}

function RequestPosters({ items, onSelect, onIntent }: RequestViewProps) {
  const { lookup } = useUserDirectory()
  return (
    <PosterRow>
      {items.map((item) => (
        <PosterCard
          key={`${item.source}-${item.id}`}
          title={item.title}
          subtitle={requestedBy(item, lookup(item.userName).name)}
          thumb={item.thumb}
          type={item.contentType}
          status={<RequestStatus status={item.status} />}
          onSelect={() => onSelect(item)}
          onIntent={() => onIntent(item)}
        />
      ))}
    </PosterRow>
  )
}

function RecentRequestsSkeleton({
  view,
  limit,
}: {
  view: MediaView
  limit: number
}) {
  if (view === 'carousel') return <PosterRowSkeleton />
  return (
    <ItemRowsSkeleton
      count={limit}
      action={<Skeleton className="h-6 w-20" />}
    />
  )
}

export function RecentRequestsCardSkeleton() {
  const [view] = usePref(recentViewPref)
  const [limit] = usePref(recentLimitPref)
  return (
    <Card>
      <CardHeaderSkeleton action={<Skeleton className="h-8 w-28" />} />
      <CardContent className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="ml-auto h-8 w-18" />
        </div>
        <RecentRequestsSkeleton view={view} limit={limit} />
      </CardContent>
    </Card>
  )
}

// Approval and watchlist ids can collide, so the source is part of the key.
function requestKey(request: RecentRequest) {
  return `${request.source}:${request.id}`
}

export function RecentRequests({ recent }: { recent: RecentRequestsState }) {
  const { items, view, status } = recent
  const { selection, select, setOpen } = useMediaSelection((key) => {
    const request = items?.find((item) => requestKey(item) === key)
    return request && recentRequestItem(request)
  })
  const selectRequest = (request: RecentRequest) =>
    select(requestKey(request), recentRequestItem(request))
  const prefetch = usePrefetchMediaDetail()
  const prefetchRequest = (request: RecentRequest) =>
    prefetch(recentRequestItem(request))
  const emptyMessage =
    status === 'all' ? 'No requests yet.' : 'No requests match this filter.'

  const content = recent.errorMessage ? (
    <ErrorAlert message={recent.errorMessage} />
  ) : recent.isLoading ? (
    <RecentRequestsSkeleton view={view} limit={recent.limit} />
  ) : items === undefined ? null : items.length === 0 ? (
    <p className="text-muted-foreground">{emptyMessage}</p>
  ) : view === 'carousel' ? (
    <RequestPosters
      items={items}
      onSelect={selectRequest}
      onIntent={prefetchRequest}
    />
  ) : (
    <RequestList
      items={items}
      onSelect={selectRequest}
      onIntent={prefetchRequest}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent requests</CardTitle>
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
      <CardContent className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Status"
            value={status}
            options={STATUS_FILTERS}
            onValueChange={recent.setStatus}
          />
          <CompactSelect
            label="Number of requests"
            value={recent.limit}
            options={LIMIT_OPTIONS}
            onValueChange={recent.setLimit}
          />
          <ViewToggle value={view} onValueChange={recent.setView} />
        </div>
        {content}
      </CardContent>
      {selection && (
        <MediaDetail
          open={selection.open}
          onOpenChange={setOpen}
          item={selection.item}
        />
      )}
    </Card>
  )
}
