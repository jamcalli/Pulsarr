import { ListVideo } from 'lucide-react'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CardTitleCount } from '@/components/card-title-count'
import { DataTableFooter } from '@/components/data-table/data-table-footer'
import { EmptyState } from '@/components/empty-state'
import { NoMatchesEmpty } from '@/components/no-matches-empty'
import {
  RequestBrowserDetail,
  RequestBrowserItems,
} from '@/components/request-list/request-browser'
import { RequestListSkeleton } from '@/components/request-list/request-list-skeleton'
import {
  ViewToggle,
  ViewToggleSkeleton,
} from '@/components/request-list/view-toggle'
import { SearchField, SearchFieldSkeleton } from '@/components/search-field'
import { StatusFilter, StatusFilterSkeleton } from '@/components/status-filter'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useUserWatchlist } from '@/features/users/hooks/user/useUserWatchlist'
import { useWatchlistView } from '@/features/users/hooks/user/useWatchlistView'
import { watchlistPageSizePref } from '@/features/users/lib/user/watchlist-state'
import { useRequestBrowser } from '@/hooks/useRequestBrowser'
import type { RecentRequest } from '@/lib/media-item'
import { usePref } from '@/lib/prefs'
import { REQUEST_STATUS_OPTIONS } from '@/lib/request-labels'

const CONTROLS_ROW = 'flex flex-wrap items-center gap-2'
const SEARCH_CLASS = 'max-md:w-full'
const STATUS_SKELETON_CLASS = 'w-80'
const VIEW_TOGGLE_CLASS = 'max-md:hidden'

interface UserWatchlistSectionProps {
  items: RecentRequest[]
}

export function UserWatchlistSection({ items }: UserWatchlistSectionProps) {
  const watchlist = useUserWatchlist(items)
  const { state, view, rows } = watchlist
  const browser = useRequestBrowser(items)
  const isEmpty = items.length === 0

  const content = isEmpty ? (
    <EmptyState
      icon={<ListVideo />}
      title="Their watchlist is empty"
      description="Items they add to their Plex watchlist show up here."
    />
  ) : rows.length === 0 ? (
    <NoMatchesEmpty
      title="Nothing matches"
      description="Try another search, or clear the filters."
      onClear={() => watchlist.update({ q: '', status: null })}
    />
  ) : (
    <>
      <RequestBrowserItems browser={browser} items={rows} view={view} />
      {view === 'list' && (
        <DataTableFooter
          page={watchlist.page}
          pageSize={watchlist.pageSize}
          onPageSizeChange={watchlist.setPageSize}
          total={watchlist.total}
          pageHref={watchlist.pageHref}
          onPageChange={watchlist.setPage}
        />
      )}
    </>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitleCount title="Watchlist" count={items.length} />
      </CardHeader>
      <CardContent className="gap-4">
        {!isEmpty && (
          <div className={CONTROLS_ROW}>
            <SearchField
              label="Search titles"
              value={state.q}
              onValueChange={(q) => watchlist.update({ q })}
              className={SEARCH_CLASS}
            />
            <StatusFilter
              options={REQUEST_STATUS_OPTIONS}
              value={state.status ?? 'all'}
              onValueChange={(status) =>
                watchlist.update({ status: status === 'all' ? null : status })
              }
            />
            <ViewToggle
              value={view}
              onValueChange={watchlist.setView}
              className={VIEW_TOGGLE_CLASS}
            />
          </div>
        )}
        {content}
      </CardContent>
      <RequestBrowserDetail browser={browser} />
    </Card>
  )
}

export function UserWatchlistSectionSkeleton() {
  const [view] = useWatchlistView()
  const [pageSize] = usePref(watchlistPageSizePref)
  return (
    <Card>
      <CardHeaderSkeleton badge />
      <CardContent className="gap-4">
        <div className={CONTROLS_ROW}>
          <SearchFieldSkeleton className={SEARCH_CLASS} />
          <StatusFilterSkeleton className={STATUS_SKELETON_CLASS} />
          <ViewToggleSkeleton className={VIEW_TOGGLE_CLASS} />
        </div>
        <RequestListSkeleton view={view} limit={pageSize} />
      </CardContent>
    </Card>
  )
}
