import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { NavPageButton } from '@/components/nav-page-button'
import {
  RequestBrowserDetail,
  RequestBrowserItems,
} from '@/components/request-list/request-browser'
import { RequestListSkeleton } from '@/components/request-list/request-list-skeleton'
import {
  ViewToggle,
  ViewToggleSkeleton,
} from '@/components/request-list/view-toggle'
import { StatusFilter, StatusFilterSkeleton } from '@/components/status-filter'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { RecentRequestsState } from '@/features/home/hooks/useRecentRequests'
import { useRequestBrowser } from '@/hooks/useRequestBrowser'
import { formatCount } from '@/lib/format'
import { NAV_PAGES } from '@/lib/navigation'
import { usePref } from '@/lib/prefs'
import { REQUEST_STATUS_OPTIONS } from '@/lib/request-labels'
import {
  RECENT_LIMITS,
  recentLimitPref,
  recentViewPref,
} from '@/lib/request-list-prefs'

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
          <StatusFilterSkeleton className="w-80" />
          <Skeleton className="h-8 w-24" />
          <ViewToggleSkeleton />
        </div>
        <RequestListSkeleton view={view} limit={limit} />
      </CardContent>
    </Card>
  )
}

export function RecentRequests({ recent }: { recent: RecentRequestsState }) {
  const { items, view, status } = recent
  const browser = useRequestBrowser(items)
  const emptyMessage =
    status === 'all' ? 'No requests yet.' : 'No requests match this filter.'

  const content = recent.errorMessage ? (
    <ErrorAlert message={recent.errorMessage} />
  ) : recent.isLoading ? (
    <RequestListSkeleton view={view} limit={recent.limit} />
  ) : items === undefined ? null : items.length === 0 ? (
    <p className="text-muted-foreground">{emptyMessage}</p>
  ) : (
    <RequestBrowserItems browser={browser} items={items} view={view} />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent requests</CardTitle>
        <CardAction>
          <NavPageButton page={NAV_PAGES.approvalQueue} />
        </CardAction>
      </CardHeader>
      <CardContent className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusFilter
            options={REQUEST_STATUS_OPTIONS}
            value={status}
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
      <RequestBrowserDetail browser={browser} />
    </Card>
  )
}
