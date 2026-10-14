import { ErrorAlert } from '@/components/error-alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LibraryMixCard,
  LibraryMixCardSkeleton,
} from '@/features/home/components/analytics/library-mix-card'
import {
  NotificationsCard,
  NotificationsCardSkeleton,
} from '@/features/home/components/analytics/notifications-card'
import {
  PipelineCard,
  PipelineCardSkeleton,
} from '@/features/home/components/analytics/pipeline-card'
import {
  RequestToReadyCard,
  RequestToReadyCardSkeleton,
} from '@/features/home/components/analytics/request-to-ready-card'
import {
  TopGenresCard,
  TopGenresCardSkeleton,
} from '@/features/home/components/analytics/top-genres-card'
import type { DashboardStats } from '@/features/home/hooks/useDashboardStats'
import type { TopGenres } from '@/features/home/hooks/useTopGenres'
import { rangeLabel } from '@/features/home/lib/range-label'

const GRID =
  'grid grid-cols-1 items-start gap-5 md:grid-cols-2 md:items-stretch'
const COLUMN = 'flex flex-col gap-5 md:*:last:flex-1'
const SECTION = 'flex flex-col gap-4'
const SECTION_HEADER = 'flex flex-wrap items-baseline justify-between gap-2'

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <PipelineCardSkeleton />
      <div className={GRID}>
        <div className={COLUMN}>
          <RequestToReadyCardSkeleton />
          <TopGenresCardSkeleton />
        </div>
        <div className={COLUMN}>
          <NotificationsCardSkeleton />
          <LibraryMixCardSkeleton />
        </div>
      </div>
    </div>
  )
}

export function AnalyticsSectionSkeleton() {
  return (
    <section className={SECTION}>
      <div className={SECTION_HEADER}>
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-5 w-24" />
      </div>
      <AnalyticsSkeleton />
    </section>
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
      <PipelineCard
        statuses={data.status_distribution}
        instances={data.instance_content_breakdown}
      />
      <div className={GRID}>
        <div className={COLUMN}>
          <RequestToReadyCard times={data.request_to_ready_times} />
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
    <section className={SECTION}>
      <div className={SECTION_HEADER}>
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
