import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { AnalyticsDashboard } from '@/features/dashboard/components/analytics-dashboard'
import { PopularityRankings } from '@/features/dashboard/components/popularity-rankings'
import { StatsHeader } from '@/features/dashboard/components/stats-header'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { toast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'

export function DashboardPage() {
  const { refreshStats, isLoading } = useDashboardStats()
  const { configInitialize, isConfigInitialized, configError } = useConfigStore(
    useShallow((state) => ({
      configInitialize: state.initialize,
      isConfigInitialized: state.isInitialized,
      configError: state.error,
    })),
  )

  const hasInitialRefresh = useRef(false)
  const initInFlight = useRef(false)
  const lastConfigErrorRef = useRef<string | null>(null)

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
            const message = err instanceof Error ? err.message : String(err)
            toast({
              variant: 'destructive',
              title: 'Stats Refresh Failed',
              description: `Unable to refresh dashboard statistics. ${message}`,
            })
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
    const msg =
      typeof configError === 'string' ? configError : String(configError)
    if (lastConfigErrorRef.current === msg) return
    toast({
      variant: 'destructive',
      title: 'Configuration Error',
      description: msg,
    })
    lastConfigErrorRef.current = msg
  }, [configError])

  const handleRefresh = useCallback(async () => {
    if (!isLoading) {
      try {
        await refreshStats()
      } catch (err) {
        console.error('Dashboard stats refresh error:', err)
        const message = err instanceof Error ? err.message : String(err)
        toast({
          variant: 'destructive',
          title: 'Stats Refresh Failed',
          description: `Unable to refresh dashboard statistics. ${message}`,
        })
      }
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
