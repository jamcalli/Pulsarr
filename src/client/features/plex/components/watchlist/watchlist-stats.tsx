import React, { useEffect } from 'react'
import { FormControl } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { usePlexWatchlist } from '../../hooks/usePlexWatchlist'
import { useConfigStore } from '@/stores/configStore'

// In your features/plex/components/watchlist/watchlist-stats.tsx

export default function WatchlistStatsSection() {
  // Get the raw users directly instead of using the selectors
  const users = useConfigStore((state) => state.users)

  // Compute the values directly in the component
  const selfWatchlist = users?.find((user) => Number(user.id) === 1)
  const otherUsers = users?.filter((user) => Number(user.id) !== 1) || []
  const othersTotal = otherUsers.reduce(
    (acc, user) => acc + (user.watchlist_count || 0),
    0,
  )

  // Watchlist status management can remain the same
  const { selfWatchlistStatus, othersWatchlistStatus } = usePlexWatchlist()

  // Log for debugging
  useEffect(() => {
    console.log('Users data:', {
      users,
      selfWatchlist,
      otherUsers,
      othersTotal,
    })
  }, [users, selfWatchlist, otherUsers, othersTotal])

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="flex-grow">
          <div className="text-text text-sm font-medium mb-2">
            Self Watchlist
          </div>
          {selfWatchlistStatus === 'loading' ? (
            <div className="space-y-1">{/* Loading UI */}</div>
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
        <div className="flex-grow">
          <div className="text-text text-sm font-medium mb-2">
            Others Watchlist
          </div>
          {othersWatchlistStatus === 'loading' ? (
            <div className="space-y-1">{/* Loading UI */}</div>
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
