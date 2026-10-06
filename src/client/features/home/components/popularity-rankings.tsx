import { AvatarStack } from '@/components/avatar-stack'
import { BusyLabel } from '@/components/busy-label'
import { CompactSelect } from '@/components/compact-select'
import { ErrorAlert } from '@/components/error-alert'
import { PosterCard } from '@/components/poster-card'
import { PosterFrame, PosterFrameSkeleton } from '@/components/poster-frame'
import { PosterRow, PosterRowSkeleton } from '@/components/poster-row'
import { RankedList } from '@/components/ranked-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MediaDetail } from '@/features/home/components/media-detail/media-detail'
import { ViewToggle } from '@/features/home/components/view-toggle'
import type { DashboardStats } from '@/features/home/hooks/useDashboardStats'
import { useMediaSelection } from '@/features/home/hooks/useMediaSelection'
import { usePopularityRankings } from '@/features/home/hooks/usePopularityRankings'
import { usePrefetchMediaDetail } from '@/features/home/hooks/usePrefetchMediaDetail'
import type { RecentRequest } from '@/features/home/hooks/useRecentRequests'
import { type MediaView, RANKING_LIMITS } from '@/features/home/lib/home-prefs'
import { rankingItem } from '@/features/home/lib/media-item'
import { rangeLabel } from '@/features/home/lib/range-label'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatCount, formatNumber, formatTime } from '@/lib/format'
import type { components } from '@/types/api.js'

type RankedContent = components['schemas']['ContentStat']

const LIMIT_OPTIONS = RANKING_LIMITS.map((limit) => ({
  value: limit,
  label: `Top ${formatNumber(limit)}`,
}))

const SHELVES = [
  {
    key: 'most_watched_shows',
    title: 'Most watchlisted shows',
    empty: 'No shows on any watchlist in this range.',
  },
  {
    key: 'most_watched_movies',
    title: 'Most watchlisted movies',
    empty: 'No movies on any watchlist in this range.',
  },
] as const

type ShelfKey = (typeof SHELVES)[number]['key']

// Rankings carry no id and the server groups them by title and guids, so same-named titles stay apart.
function rankingKey(shelfKey: ShelfKey, item: RankedContent) {
  return `${shelfKey}:${item.title}:${(item.guids ?? []).join(',')}`
}

const SHELF_HEADING = 'font-heading font-bold'

function RankChip({ rank }: { rank: number }) {
  return (
    <Badge variant="outline" className="px-1.5 font-mono tabular-nums">
      {formatNumber(rank)}
    </Badge>
  )
}

interface ShelfProps {
  shelfKey: ShelfKey
  title: string
  empty: string
  items: RankedContent[]
  view: MediaView
  onSelect: (item: RankedContent) => void
  onIntent: (item: RankedContent) => void
}

function Shelf({
  shelfKey,
  title,
  empty,
  items,
  view,
  onSelect,
  onIntent,
}: ShelfProps) {
  const lookup = useUserDirectory()
  const heading = <h3 className={SHELF_HEADING}>{title}</h3>
  const watchers = (item: RankedContent) =>
    (item.users ?? []).map((username) => ({ username, ...lookup(username) }))

  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        {heading}
        <p className="text-muted-foreground">{empty}</p>
      </section>
    )
  }

  if (view === 'carousel') {
    return (
      <section>
        <PosterRow heading={heading}>
          {items.map((item, index) => (
            <PosterCard
              key={rankingKey(shelfKey, item)}
              title={item.title}
              subtitle={
                <span className="flex items-center justify-between gap-2">
                  {formatCount(item.count, 'watchlist')}
                  <AvatarStack people={watchers(item)} />
                </span>
              }
              thumb={item.thumb}
              type={item.content_type}
              status={<RankChip rank={index + 1} />}
              onSelect={() => onSelect(item)}
              onIntent={() => onIntent(item)}
            />
          ))}
        </PosterRow>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      {heading}
      <RankedList
        items={items.map((item, index) => ({
          key: rankingKey(shelfKey, item),
          rank: index + 1,
          media: (
            <PosterFrame
              size="thumb"
              thumb={item.thumb}
              type={item.content_type}
            />
          ),
          title: item.title,
          subtitle: formatCount(item.count, 'watchlist'),
          trailing: <AvatarStack people={watchers(item)} />,
          onSelect: () => onSelect(item),
          onIntent: () => onIntent(item),
        }))}
      />
    </section>
  )
}

function ShelfSkeleton({ view }: { view: MediaView }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-48" />
      {view === 'carousel' ? (
        <PosterRowSkeleton />
      ) : (
        <div className="flex flex-col">
          {['a', 'b', 'c', 'd', 'e'].map((key) => (
            <div key={key} className="flex items-center gap-2.5 py-2.5">
              <Skeleton className="h-4 w-6" />
              <PosterFrameSkeleton size="thumb" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface PopularityRankingsProps {
  stats: DashboardStats
  recentRequests: RecentRequest[] | undefined
}

export function PopularityRankings({
  stats,
  recentRequests,
}: PopularityRankingsProps) {
  const rankings = usePopularityRankings(stats)
  const { data, view } = rankings
  const { selection, select, setOpen } = useMediaSelection((key) => {
    const content = SHELVES.flatMap((shelf) =>
      (data?.[shelf.key] ?? []).filter(
        (item) => rankingKey(shelf.key, item) === key,
      ),
    )[0]
    return content && rankingItem(content, recentRequests)
  })
  const selectRanking = (shelfKey: ShelfKey, item: RankedContent) =>
    select(rankingKey(shelfKey, item), rankingItem(item, recentRequests))
  const prefetch = usePrefetchMediaDetail()
  const prefetchRanking = (item: RankedContent) =>
    prefetch(rankingItem(item, recentRequests))

  const content = rankings.errorMessage ? (
    <ErrorAlert message={rankings.errorMessage} />
  ) : rankings.isLoading ? (
    SHELVES.map((shelf) => <ShelfSkeleton key={shelf.key} view={view} />)
  ) : data === undefined ? null : (
    SHELVES.map((shelf) => (
      <Shelf
        key={shelf.key}
        shelfKey={shelf.key}
        title={shelf.title}
        empty={shelf.empty}
        items={data[shelf.key]}
        view={view}
        onSelect={(item) => selectRanking(shelf.key, item)}
        onIntent={prefetchRanking}
      />
    ))
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Popularity rankings</CardTitle>
        <CardDescription>{rangeLabel(rankings.days)}</CardDescription>
        <CardAction className="flex items-center gap-2">
          {rankings.updatedAt > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Last updated {formatTime(rankings.updatedAt)}
            </span>
          )}
          <Button
            type="button"
            variant="neutral"
            size="sm"
            disabled={rankings.isFetching}
            onClick={rankings.refresh}
          >
            <BusyLabel
              busy={rankings.isFetching}
              label="Refresh"
              busyLabel="Refreshing..."
            />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <CompactSelect
            label="Number of titles"
            value={rankings.limit}
            options={LIMIT_OPTIONS}
            onValueChange={rankings.setLimit}
          />
          <ViewToggle value={view} onValueChange={rankings.setView} />
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
