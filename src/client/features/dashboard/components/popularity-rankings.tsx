import { Loader2, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { WatchlistCarousel } from '@/features/dashboard/components/watchlist-carousel'
import {
  DATE_RANGE_PRESETS,
  getDateRangeLabel,
  getLimitLabel,
  LIMIT_PRESETS,
  useDashboardStats,
} from '@/features/dashboard/hooks/useDashboardStats'

interface PopularityRankingsProps {
  onRefresh: () => Promise<void>
}

/**
 * Renders a section displaying the most watchlisted shows and movies in separate carousels, each with combined general and category-specific loading and error state handling.
 *
 * Shows a "Popularity Rankings" heading and two carousels—one for shows and one for movies—using data and state from dashboard statistics.
 */
export function PopularityRankings({ onRefresh }: PopularityRankingsProps) {
  const {
    mostWatchedShows,
    mostWatchedMovies,
    loadingStates,
    errorStates,
    isLoading,
    lastRefreshed,
    days,
    setDays,
    limit,
    setLimit,
  } = useDashboardStats()

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
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold text-foreground">
          Popularity Rankings
        </h2>
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
        <Button
          onClick={onRefresh}
          disabled={isLoading}
          variant="neutralnoShadow"
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <WatchlistCarousel
          title="Most Watchlisted Shows"
          items={mostWatchedShows || []}
          loading={loadingStates.all || loadingStates.shows}
          error={errorStates.all || errorStates.shows}
        />

        <WatchlistCarousel
          title="Most Watchlisted Movies"
          items={mostWatchedMovies || []}
          loading={loadingStates.all || loadingStates.movies}
          error={errorStates.all || errorStates.movies}
        />
      </div>
    </div>
  )
}
