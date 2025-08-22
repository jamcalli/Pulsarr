import { useCallback, useEffect, useRef } from 'react'
import { AnalyticsDashboard } from '@/features/dashboard/components/analytics-dashboard'
import { PopularityRankings } from '@/features/dashboard/components/popularity-rankings'
import { StatsHeader } from '@/features/dashboard/components/stats-header'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { useConfigStore } from '@/stores/configStore'

export function DashboardPage() {
  const { refreshStats, isLoading } = useDashboardStats()
  const configInitialize = useConfigStore((state) => state.initialize)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    // Guard against React 18 StrictMode double-invocation
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        await configInitialize()
      } catch (e) {
        console.error('Dashboard init error:', e)
      } finally {
        if (!cancelled) {
          await refreshStats()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshStats, configInitialize])

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
