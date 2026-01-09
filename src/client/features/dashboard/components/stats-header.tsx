import { WatchlistStatusBadge } from '@/components/ui/workflow-status-badge'

/**
 * Dashboard header showing title and watchlist status badge.
 */
export function StatsHeader() {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center">
        <h1 className="text-3xl font-bold text-foreground">Main Workflow</h1>
        <WatchlistStatusBadge />
      </div>
    </div>
  )
}
