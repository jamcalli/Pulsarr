import { Link } from 'react-router-dom'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { MediaDetail } from '@/components/media-detail/media-detail'
import {
  RequestList,
  RequestPosters,
  requestKey,
} from '@/components/request-list/request-list'
import { RequestListSkeleton } from '@/components/request-list/request-list-skeleton'
import { ViewToggle } from '@/components/request-list/view-toggle'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { RecentRequestsState } from '@/features/home/hooks/useRecentRequests'
import { useMediaSelection } from '@/hooks/useMediaSelection'
import { usePrefetchMediaDetail } from '@/hooks/usePrefetchMediaDetail'
import { formatCount } from '@/lib/format'
import { type RecentRequest, recentRequestItem } from '@/lib/media-item'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { usePref } from '@/lib/prefs'
import { REQUEST_STATUS_OPTIONS } from '@/lib/request-labels'
import {
  RECENT_LIMITS,
  type RecentStatus,
  recentLimitPref,
  recentViewPref,
} from '@/lib/request-list-prefs'

const STATUS_FILTERS: ReadonlyArray<{ value: RecentStatus; label: string }> = [
  { value: 'all', label: 'All' },
  ...REQUEST_STATUS_OPTIONS,
]

const LIMIT_OPTIONS = RECENT_LIMITS.map((limit) => ({
  value: limit,
  label: formatCount(limit, 'item'),
}))

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
        <RequestListSkeleton view={view} limit={limit} />
      </CardContent>
    </Card>
  )
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
    <RequestListSkeleton view={view} limit={recent.limit} />
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
