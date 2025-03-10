import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'

export type WatchlistStatus = 'idle' | 'loading' | 'success' | 'error'

export function usePlexWatchlist() {
  const { toast } = useToast()
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const getSelfWatchlistInfo = useConfigStore(
    (state) => state.getSelfWatchlistInfo,
  )
  const getOthersWatchlistInfo = useConfigStore(
    (state) => state.getOthersWatchlistInfo,
  )

  // Get watchlist data from store
  const selfWatchlist = getSelfWatchlistInfo()
  const othersWatchlist = getOthersWatchlistInfo()

  // Status states
  const [selfWatchlistStatus, setSelfWatchlistStatus] =
    useState<WatchlistStatus>('idle')
  const [othersWatchlistStatus, setOthersWatchlistStatus] =
    useState<WatchlistStatus>('idle')

  const refreshWatchlists = async () => {
    try {
      setSelfWatchlistStatus('loading')
      setOthersWatchlistStatus('loading')

      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      await Promise.all([
        fetch('/v1/plex/self-watchlist-token'),
        fetch('/v1/plex/others-watchlist-token'),
        minimumLoadingTime,
      ])

      setSelfWatchlistStatus('success')
      setOthersWatchlistStatus('success')
      await fetchUserData()

      toast({
        title: 'Watchlists Refreshed',
        description: 'Watchlist data has been updated',
        variant: 'default',
      })
    } catch (error) {
      setSelfWatchlistStatus('error')
      setOthersWatchlistStatus('error')
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh watchlist data',
        variant: 'destructive',
      })
    }
  }

  return {
    selfWatchlist,
    othersWatchlist,
    selfWatchlistStatus,
    othersWatchlistStatus,
    setSelfWatchlistStatus,
    setOthersWatchlistStatus,
    refreshWatchlists,
  }
}
