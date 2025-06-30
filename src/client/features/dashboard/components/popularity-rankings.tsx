import { WatchlistCarousel } from '@/features/dashboard/components/watchlist-carousel'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

/**
 * Displays the most watchlisted shows and movies in separate carousels with loading and error handling.
 *
 * Presents a "Popularity Rankings" section containing two carousels: one for the most watchlisted shows and one for the most watchlisted movies. Handles loading and error states for each carousel.
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
