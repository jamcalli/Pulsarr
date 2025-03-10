import React from 'react'
import { FormControl } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { usePlexWatchlist } from '../../hooks/usePlexWatchlist'

export default function WatchlistStatsSection() {
  const { 
    selfWatchlist, 
    othersWatchlist, 
    selfWatchlistStatus, 
    othersWatchlistStatus 
  } = usePlexWatchlist()
  
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')

  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <div className="flex-grow">
          <div className="text-text text-sm font-medium mb-2">
            Self Watchlist
          </div>
          {selfWatchlistStatus === 'loading' ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text">
                  {selfWatchlistProgress.message || 'Processing...'}
                </span>
                <span className="text-sm text-text">
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
        <div className="flex-grow">
          <div className="text-text text-sm font-medium mb-2">
            Others Watchlist
          </div>
          {othersWatchlistStatus === 'loading' ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text">
                  {othersWatchlistProgress.message ||
                    'Processing...'}
                </span>
                <span className="text-sm text-text">
                  {othersWatchlistProgress.progress}%
                </span>
              </div>
              <Progress value={othersWatchlistProgress.progress} />
            </div>
          ) : (
            <Input
              value={
                othersWatchlist
                  ? `${othersWatchlist.users.length.toLocaleString()} users with ${othersWatchlist.totalCount.toLocaleString()} items total`
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