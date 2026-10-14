import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalyticsSectionSkeleton } from '@/features/home/components/analytics/analytics-section'
import { ApprovalsCardSkeleton } from '@/features/home/components/approvals-card'
import { MostActiveCardSkeleton } from '@/features/home/components/most-active-card'
import { PopularityRankingsCardSkeleton } from '@/features/home/components/popularity-rankings'
import { RecentRequestsCardSkeleton } from '@/features/home/components/recent-requests'
import { HOME_TOP_GRID } from '@/features/home/lib/home-layout'

export function HomeSkeleton() {
  return (
    <Page wide busy>
      <PageHeaderSkeleton
        section={false}
        action={<Skeleton className="h-8 w-28" />}
      />
      <div className={HOME_TOP_GRID}>
        <ApprovalsCardSkeleton />
        <MostActiveCardSkeleton />
      </div>
      <RecentRequestsCardSkeleton />
      <PopularityRankingsCardSkeleton />
      <AnalyticsSectionSkeleton />
    </Page>
  )
}
