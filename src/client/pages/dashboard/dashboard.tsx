import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WatchlistStatusBadge } from '@/components/ui/workflow-status-badge'
import { WatchlistCarousel } from '@/components/dashboard/watchlist-carousel'
import { useStatsStore } from '@/stores/statsStore'
import TypedStatsDashboard from '@/components/dashboard/stats-charts'

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const {
    fetchAllStats,
    mostWatchedMovies,
    mostWatchedShows,
    loading,
    errors,
  } = useStatsStore()

  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      try {
        await fetchAllStats({ limit: 10 })
        if (isMounted) setIsLoading(false)
      } catch (error) {
        console.error('Error loading stats:', error)
        if (isMounted) setIsLoading(false)
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [fetchAllStats])

  const handleRefresh = async () => {
    setIsLoading(true)
    await fetchAllStats({ limit: 10 })
    setIsLoading(false)
    setLastRefreshed(new Date())
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      {/* Dashboard Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold text-text">Media Statistics</h1>
          <WatchlistStatusBadge />
        </div>
      </div>

      {/* Refresh and Last Updated Container */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          onClick={handleRefresh}
          disabled={isLoading}
          variant="neutral"
          className="flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>Refresh</span>
        </Button>
        <p className="text-sm text-gray-500">
          Last updated: {lastRefreshed.toLocaleTimeString()}
        </p>
      </div>

      {/* Media Statistics Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-bold text-text">
          Popularity Rankings
        </h2>

        {/* Most Watched Shows */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WatchlistCarousel
            title="Most Watchlisted Shows"
            items={mostWatchedShows || []}
            loading={loading.all || loading.shows}
            error={errors.all || errors.shows}
          />

          <WatchlistCarousel
            title="Most Watchlisted Movies"
            items={mostWatchedMovies || []}
            loading={loading.all || loading.movies}
            error={errors.all || errors.movies}
          />
        </div>
      </div>

      {/* Statistics Dashboard */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-bold text-text">Media Analytics</h2>
        <TypedStatsDashboard />
      </div>
    </div>
  )
}

export default DashboardPage
