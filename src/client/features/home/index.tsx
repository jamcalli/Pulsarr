import { ErrorAlert } from '@/components/error-alert'
import { Page, PageHeader } from '@/components/page-header'
import { CustomizeHomeButton } from '@/features/home/components/customize/customize-home-button'
import { HomeRows } from '@/features/home/components/home-rows'
import { HomeSkeleton } from '@/features/home/components/home-skeleton'
import { RangeSelect } from '@/features/home/components/range-select'
import { useDashboardInvalidation } from '@/features/home/hooks/useDashboardInvalidation'
import { useDashboardStats } from '@/features/home/hooks/useDashboardStats'
import { useHomeLayout } from '@/features/home/hooks/useHomeLayout'
import { useRecentRequests } from '@/features/home/hooks/useRecentRequests'
import { useTopGenres } from '@/features/home/hooks/useTopGenres'
import { useTopUsers } from '@/features/home/hooks/useTopUsers'
import {
  HOME_CARDS,
  type HomeCardContext,
  splitAtStatsCards,
} from '@/features/home/lib/home-cards'
import type { HomeCardId } from '@/features/home/lib/home-layout'
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
  const homeLayout = useHomeLayout()
  useDashboardInvalidation()
  const ctx: HomeCardContext = { stats, recent, topUsers, topGenres }
  const firstLoad = homeLayout.rows.some((row) =>
    row.cards.some((id) => !HOME_CARDS[id].isReady(ctx)),
  )

  if (firstLoad) return <HomeSkeleton />

  const statsSplit = stats.errorMessage
    ? splitAtStatsCards(homeLayout.rows)
    : null
  const [rowsAbove, rowsBelow] = statsSplit ?? [homeLayout.rows, []]
  const renderCard = (id: HomeCardId) => HOME_CARDS[id].render(ctx)

  return (
    <Page wide>
      <PageHeader
        title="Home"
        description={statusLine(sync.state, pendingCount)}
        action={
          <div className="flex items-center gap-2">
            <RangeSelect value={stats.days} onValueChange={stats.setDays} />
            <CustomizeHomeButton homeLayout={homeLayout} />
          </div>
        }
      />
      <HomeRows rows={rowsAbove} renderCard={renderCard} />
      <ErrorAlert message={statsSplit && stats.errorMessage} />
      <HomeRows rows={rowsBelow} renderCard={renderCard} />
    </Page>
  )
}
