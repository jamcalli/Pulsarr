import { useCallback, useEffect } from 'react'
import { AnalyticsDashboard } from '@/features/dashboard/components/analytics-dashboard'
import { PopularityRankings } from '@/features/dashboard/components/popularity-rankings'
import { StatsHeader } from '@/features/dashboard/components/stats-header'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { toast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'

export function DashboardPage() {
  const { refreshStats, isLoading } = useDashboardStats()
  const configInitialize = useConfigStore((state) => state.initialize)
  const isConfigInitialized = useConfigStore((state) => state.isInitialized)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!isConfigInitialized) {
          await configInitialize()
        }
      } catch (e) {
        console.error('Dashboard init error:', e)
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Configuration Error',
            description:
              'Failed to load application configuration. Please refresh the page or check your connection.',
          })
        }
      } finally {
        if (!cancelled) {
          await refreshStats()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshStats, configInitialize, isConfigInitialized])

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
