import { useCallback, useEffect } from 'react'
import { AnalyticsDashboard } from '@/features/dashboard/components/analytics-dashboard'
import { PopularityRankings } from '@/features/dashboard/components/popularity-rankings'
import { StatsHeader } from '@/features/dashboard/components/stats-header'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

export function DashboardPage() {
  const { refreshStats, isLoading } = useDashboardStats()

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  const handleRefresh = useCallback(async () => {
    if (!isLoading) {
      await refreshStats()
    }
  }, [refreshStats, isLoading])

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <StatsHeader onRefresh={handleRefresh} />
      <PopularityRankings />
      <AnalyticsDashboard />
    </div>
  )
}

export default DashboardPage
