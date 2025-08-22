import { useCallback, useEffect, useRef } from 'react'
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
  const configError = useConfigStore((state) => state.error)

  const hasInitialRefresh = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (hasInitialRefresh.current) return
      try {
        if (!isConfigInitialized) {
          await configInitialize()
        }
      } catch (e) {
        console.error('Dashboard init error:', e)
        // Errors are handled in store; we surface via a separate effect below.
      } finally {
        if (!cancelled) {
          await refreshStats()
          hasInitialRefresh.current = true
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshStats, configInitialize, isConfigInitialized])

  // React to config errors from the store
  useEffect(() => {
    if (!configError) return
    toast({
      variant: 'destructive',
      title: 'Configuration Error',
      description: configError,
    })
  }, [configError])

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
