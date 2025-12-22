import { Loader2, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { WatchlistStatusBadge } from '@/components/ui/workflow-status-badge'
import {
  DATE_RANGE_PRESETS,
  getDateRangeLabel,
  getLimitLabel,
  LIMIT_PRESETS,
  useDashboardStats,
} from '@/features/dashboard/hooks/useDashboardStats'

interface StatsHeaderProps {
  onRefresh: () => Promise<void>
}

/**
 * Dashboard header for the "Main Workflow" view.
 *
 * Renders the title and watchlist status badge, date range and limit selectors,
 * a refresh control, and a "Last updated" timestamp.
 */
export function StatsHeader({ onRefresh }: StatsHeaderProps) {
  const { isLoading, lastRefreshed, days, setDays, limit, setLimit } =
    useDashboardStats()

  const dateRangeOptions = useMemo(
    () =>
      DATE_RANGE_PRESETS.map((preset) => ({
        label: getDateRangeLabel(preset),
        value: preset.toString(),
      })),
    [],
  )

  const limitOptions = useMemo(
    () =>
      LIMIT_PRESETS.map((preset) => ({
        label: getLimitLabel(preset),
        value: preset.toString(),
      })),
    [],
  )

  return (
    <>
      {/* Dashboard Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold text-foreground">Main Workflow</h1>
          <WatchlistStatusBadge />
        </div>
      </div>

      {/* Controls Row: Date Range, Limit, Refresh, Last Updated */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Select
            value={days.toString()}
            onValueChange={(value) => setDays(Number(value))}
            options={dateRangeOptions}
            disabled={isLoading}
            className="w-[140px]"
          />

          <Select
            value={limit.toString()}
            onValueChange={(value) => setLimit(Number(value))}
            options={limitOptions}
            disabled={isLoading}
            className="w-[110px]"
          />
        </div>

        <div className="flex items-center gap-3">
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
      </div>
    </>
  )
}
