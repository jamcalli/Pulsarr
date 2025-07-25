import { WatchlistCarousel } from '@/features/dashboard/components/watchlist-carousel'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

/**
 * Displays the most watchlisted shows and movies in separate carousels with combined loading and error state handling.
 *
 * Renders a "Popularity Rankings" section containing two carousels—one for shows and one for movies—each reflecting both general and category-specific loading and error states from dashboard statistics.
 */
export function PopularityRankings() {
  const { mostWatchedShows, mostWatchedMovies, loadingStates, errorStates } =
    useDashboardStats()

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-2xl font-bold text-foreground">
        Popularity Rankings
      </h2>

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
