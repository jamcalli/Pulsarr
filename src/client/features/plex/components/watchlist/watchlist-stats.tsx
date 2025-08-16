import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { usePlexWatchlist } from '@/features/plex/hooks/usePlexWatchlist'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { useConfigStore } from '@/stores/configStore'

/**
 * Renders statistics and syncing progress for the current user's watchlist and for other users' watchlists.
 *
 * Displays the item count for the user's own watchlist and aggregates counts for other users. Shows progress bars and status messages during syncing operations for each section.
 */
export default function WatchlistStatsSection() {
  const users = useConfigStore((state) => state.users)

  const selfWatchlist = users?.find((user) => Number(user.id) === 1)
  const otherUsers = users?.filter((user) => Number(user.id) !== 1) || []
  const othersTotal = otherUsers.reduce(
    (acc, user) => acc + (user.watchlist_count || 0),
    0,
  )

  const { selfWatchlistStatus, othersWatchlistStatus } = usePlexWatchlist()

  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="grow">
          <div className="text-foreground text-sm font-medium mb-2">
            Self Watchlist
          </div>
          {selfWatchlistStatus === 'loading' ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-foreground">
                  {selfWatchlistProgress.message || 'Syncing Your Watchlist'}
                </span>
                <span className="text-sm text-foreground">
                  {selfWatchlistProgress.progress}%
                </span>
              </div>
              <Progress value={selfWatchlistProgress.progress} />
            </div>
          ) : (
            <Input
              value={
                selfWatchlist?.watchlist_count !== undefined
                  ? `You have ${selfWatchlist.watchlist_count.toLocaleString()} items in your watchlist!`
                  : ''
              }
              placeholder="No watchlist data available"
              type="text"
              readOnly
              className="w-full"
            />
          )}
        </div>
      </div>

      <div className="flex-1">
        <div className="grow">
          <div className="text-foreground text-sm font-medium mb-2">
            Others Watchlist
          </div>
          {othersWatchlistStatus === 'loading' ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-foreground">
                  {othersWatchlistProgress.message ||
                    "Syncing Others' Watchlists"}
                </span>
                <span className="text-sm text-foreground">
                  {othersWatchlistProgress.progress}%
                </span>
              </div>
              <Progress value={othersWatchlistProgress.progress} />
            </div>
          ) : (
            <Input
              value={
                otherUsers.length > 0
                  ? `${otherUsers.length.toLocaleString()} users with ${othersTotal.toLocaleString()} items total`
                  : ''
              }
              placeholder="No other watchlists available"
              type="text"
              readOnly
              className="w-full"
            />
          )}
        </div>
      </div>
    </div>
  )
}
