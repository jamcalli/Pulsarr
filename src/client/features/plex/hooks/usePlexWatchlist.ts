import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/tanstackApi'
import { useConfigStore } from '@/stores/configStore'

export type WatchlistStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * React hook that provides access to Plex watchlist data for the current user and others, along with loading statuses and a refresh function.
 *
 * Returns the current watchlist data for both the user and others, their loading statuses, setter functions for those statuses, and a function to refresh both watchlists from the server.
 *
 * @returns An object containing self and others watchlist data, their loading statuses, status setters, and a refresh function.
 */
export function usePlexWatchlist() {
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const getSelfWatchlistInfo = useConfigStore(
    (state) => state.getSelfWatchlistInfo,
  )
  const getOthersWatchlistInfo = useConfigStore(
    (state) => state.getOthersWatchlistInfo,
  )

  const selfWatchlist = getSelfWatchlistInfo()
  const othersWatchlist = getOthersWatchlistInfo()

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

      const [selfResult, othersResult] = await Promise.all([
        apiFetch.GET('/v1/plex/self-watchlist-token'),
        apiFetch.GET('/v1/plex/others-watchlist-token'),
        minimumLoadingTime,
      ])

      if (selfResult.error) throw selfResult.error
      if (othersResult.error) throw othersResult.error

      setSelfWatchlistStatus('success')
      setOthersWatchlistStatus('success')

      // Refresh user data
      await fetchUserData()

      toast.success('Watchlist data has been updated')
    } catch (_error) {
      setSelfWatchlistStatus('error')
      setOthersWatchlistStatus('error')
      toast.error('Failed to refresh watchlist data')
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
