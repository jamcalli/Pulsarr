import { ErrorAlert } from '@/components/error-alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GrabToNotifyCard } from '@/features/home/components/analytics/grab-to-notify-card'
import { LibraryMixCard } from '@/features/home/components/analytics/library-mix-card'
import { NotificationsCard } from '@/features/home/components/analytics/notifications-card'
import { PipelineCard } from '@/features/home/components/analytics/pipeline-card'
import { TopGenresCard } from '@/features/home/components/analytics/top-genres-card'
import type { DashboardStats } from '@/features/home/hooks/useDashboardStats'
import type { TopGenres } from '@/features/home/hooks/useTopGenres'
import { rangeLabel } from '@/features/home/lib/range-label'
import { TOP_GENRES_VISIBLE } from '@/features/home/lib/ranked-rows'

const GRID = 'grid items-start gap-5 md:grid-cols-2 md:items-stretch'
const COLUMN = 'flex flex-col gap-5 md:*:last:flex-1'

const SKELETON_COLUMNS = [
  [
    { key: 'grab', rows: 3 },
    { key: 'genres', rows: TOP_GENRES_VISIBLE },
  ],
  [
    { key: 'notifications', rows: 4 },
    { key: 'mix', rows: 3 },
  ],
]

function SkeletonCard({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="gap-4">
        {Array.from({ length: rows }, (_, row) => `row-${row}`).map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <SkeletonCard rows={4} />
      <div className={GRID}>
        {SKELETON_COLUMNS.map((column) => (
          <div key={column[0].key} className={COLUMN}>
            {column.map((card) => (
              <SkeletonCard key={card.key} rows={card.rows} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsSection({
  stats,
  topGenres,
}: {
  stats: DashboardStats
  topGenres: TopGenres
}) {
  const { data } = stats

  const content = stats.errorMessage ? (
    <ErrorAlert message={stats.errorMessage} />
  ) : stats.isLoading ? (
    <AnalyticsSkeleton />
  ) : data === undefined ? null : (
    <div className="flex flex-col gap-5">
      <PipelineCard instances={data.instance_content_breakdown} />
      <div className={GRID}>
        <div className={COLUMN}>
          <GrabToNotifyCard times={data.grabbed_to_notified_times} />
          <TopGenresCard topGenres={topGenres} />
        </div>
        <div className={COLUMN}>
          <NotificationsCard stats={data.notification_stats} />
          <LibraryMixCard distribution={data.content_type_distribution} />
        </div>
      </div>
    </div>
  )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xl font-bold tracking-tight">
          Media analytics
        </h2>
        <span className="text-sm text-muted-foreground">
          {rangeLabel(stats.days)}
        </span>
      </div>
      {content}
    </section>
  )
}
