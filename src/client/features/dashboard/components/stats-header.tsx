import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WatchlistStatusBadge } from '@/components/ui/workflow-status-badge'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

interface StatsHeaderProps {
  onRefresh: () => Promise<void>
}

/**
 * Displays the dashboard header with a title, watchlist status badge, and controls for refreshing and viewing the last updated time.
 *
 * @param onRefresh - Callback invoked when the refresh button is clicked.
 */
export function StatsHeader({ onRefresh }: StatsHeaderProps) {
  const { isLoading, lastRefreshed } = useDashboardStats()

  return (
    <>
      {/* Dashboard Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold text-foreground">Main Workflow</h1>
          <WatchlistStatusBadge />
        </div>
      </div>

      {/* Refresh and Last Updated Container */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          onClick={onRefresh}
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
    </>
  )
}
