import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WatchlistStatusBadge } from '@/components/ui/workflow-status-badge'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

interface StatsHeaderProps {
  onRefresh: () => Promise<void>
}

/**
 * Dashboard header for the "Main Workflow" view.
 *
 * Renders the title and watchlist status badge, a refresh control that invokes the provided
 * `onRefresh` callback, and a "Last updated" timestamp derived from the dashboard stats hook.
 *
 * The refresh button calls `onRefresh` when clicked and is disabled while the hook reports loading;
 * its icon switches to a spinner when `isLoading` is true. The timestamp displays `lastRefreshed.toLocaleTimeString()`
 * when available or the fallback text "Not yet fetched".
 *
 * @param onRefresh - Callback invoked when the refresh button is clicked. May be asynchronous (returns a `Promise<void>`).
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
          Last updated:{' '}
          {lastRefreshed
            ? lastRefreshed.toLocaleTimeString()
            : 'Not yet fetched'}
        </p>
      </div>
    </>
  )
}
