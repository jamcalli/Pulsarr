import { useCallback, useEffect, useRef } from 'react'
import { shallow } from 'zustand/shallow'
import { AnalyticsDashboard } from '@/features/dashboard/components/analytics-dashboard'
import { PopularityRankings } from '@/features/dashboard/components/popularity-rankings'
import { StatsHeader } from '@/features/dashboard/components/stats-header'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { toast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'

export function DashboardPage() {
  const { refreshStats, isLoading } = useDashboardStats()
  const {
    initialize: configInitialize,
    isInitialized: isConfigInitialized,
    error: configError,
  } = useConfigStore(
    (s) => ({
      initialize: s.initialize,
      isInitialized: s.isInitialized,
      error: s.error,
    }),
    shallow,
  )

  const hasInitialRefresh = useRef(false)
  const initInFlight = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (hasInitialRefresh.current || initInFlight.current) return
      initInFlight.current = true
      try {
        if (!isConfigInitialized) {
          await configInitialize()
        }
      } catch (e) {
        console.error('Dashboard init error:', e)
        // Errors are handled in store; we surface via a separate effect below.
      } finally {
        if (!cancelled) {
          try {
            await refreshStats()
            hasInitialRefresh.current = true
          } catch (err) {
            console.error('Dashboard stats refresh error:', err)
          }
        }
        initInFlight.current = false
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
      description:
        typeof configError === 'string' ? configError : String(configError),
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
