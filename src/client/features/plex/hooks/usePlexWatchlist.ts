import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import type { SelfWatchlistSuccess } from '@root/schemas/plex/self-watchlist-token.schema'
import type { OthersWatchlistSuccess } from '@root/schemas/plex/others-watchlist-token.schema'

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

      const [selfResponse, othersResponse] = await Promise.all([
        fetch('/v1/plex/self-watchlist-token'),
        fetch('/v1/plex/others-watchlist-token'),
        minimumLoadingTime,
      ])

      // Get the response data to make sure it's valid
      if (!selfResponse.ok || !othersResponse.ok) {
        throw new Error('Failed to fetch watchlist data')
      }

      // Convert responses to their proper types
      const selfData = (await selfResponse.json()) as SelfWatchlistSuccess
      const othersData = (await othersResponse.json()) as OthersWatchlistSuccess

      if (!selfData || !othersData) {
        throw new Error('Invalid watchlist data received')
      }

      setSelfWatchlistStatus('success')
      setOthersWatchlistStatus('success')

      // Refresh user data
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
