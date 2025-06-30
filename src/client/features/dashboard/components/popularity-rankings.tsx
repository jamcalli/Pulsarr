import { WatchlistCarousel } from '@/features/dashboard/components/watchlist-carousel'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

/**
 * Renders a section with carousels for the most watchlisted shows and movies, including loading and error handling.
 *
 * Displays a "Popularity Rankings" heading and two carousels: one for shows and one for movies. Each carousel receives its respective items and combines general and specific loading and error states to determine its status.
 */
export function PopularityRankings() {
  const { mostWatchedShows, mostWatchedMovies, loadingStates, errorStates } =
    useDashboardStats()

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-2xl font-bold text-foreground">
        Popularity Rankings
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
