import { Page, PageHeader } from '@/components/page-header'
import { AnalyticsSection } from '@/features/home/components/analytics/analytics-section'
import { ApprovalsCard } from '@/features/home/components/approvals-card'
import { HomeSkeleton } from '@/features/home/components/home-skeleton'
import { MostActiveCard } from '@/features/home/components/most-active-card'
import { PopularityRankings } from '@/features/home/components/popularity-rankings'
import { RangeSelect } from '@/features/home/components/range-select'
import { RecentRequests } from '@/features/home/components/recent-requests'
import { useDashboardInvalidation } from '@/features/home/hooks/useDashboardInvalidation'
import { useDashboardStats } from '@/features/home/hooks/useDashboardStats'
import { useRecentRequests } from '@/features/home/hooks/useRecentRequests'
import { useTopGenres } from '@/features/home/hooks/useTopGenres'
import { useTopUsers } from '@/features/home/hooks/useTopUsers'
import { HOME_TOP_GRID } from '@/features/home/lib/home-layout'
import { statusLine } from '@/features/home/lib/status-line'
import { usePendingApprovalCount } from '@/hooks/usePendingApprovalCount'
import { useSyncStatus } from '@/hooks/useSyncStatus'

export default function HomePage() {
  const sync = useSyncStatus()
  const pendingCount = usePendingApprovalCount()
  const stats = useDashboardStats()
  const recent = useRecentRequests()
  const topUsers = useTopUsers(stats.days)
  const topGenres = useTopGenres(stats.days)
  useDashboardInvalidation()
  const firstLoad =
    !stats.isReady || !recent.isReady || !topUsers.isReady || !topGenres.isReady

  if (firstLoad) return <HomeSkeleton />

  return (
    <Page wide>
      <PageHeader
        title="Home"
        description={statusLine(sync.state, pendingCount)}
        action={
          <RangeSelect value={stats.days} onValueChange={stats.setDays} />
        }
      />
      <div className={HOME_TOP_GRID}>
        <ApprovalsCard />
        <MostActiveCard topUsers={topUsers} />
      </div>
      <RecentRequests recent={recent} />
      <PopularityRankings stats={stats} recentRequests={recent.items} />
      <AnalyticsSection stats={stats} topGenres={topGenres} />
    </Page>
  )
}
