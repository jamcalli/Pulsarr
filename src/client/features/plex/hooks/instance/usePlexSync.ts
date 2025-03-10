import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { usePlexStore } from '@/features/plex/store/plexStore'
import type { SyncStatus } from '@/features/plex/store/types'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

export function usePlexSync() {
  const { toast } = useToast()
  const [selfWatchlistStatus, setSelfWatchlistStatus] = useState<SyncStatus>('idle')
  const [othersWatchlistStatus, setOthersWatchlistStatus] = useState<SyncStatus>('idle')
  const [rssStatus, setRssStatus] = useState<SyncStatus>('idle')
  
  const refreshSelfWatchlist = usePlexStore((state) => state.refreshSelfWatchlist)
  const refreshOthersWatchlist = usePlexStore((state) => state.refreshOthersWatchlist)
  const refreshAllWatchlists = usePlexStore((state) => state.refreshAllWatchlists)
  const refreshRssFeeds = usePlexStore((state) => state.refreshRssFeeds)
  const fetchUserData = usePlexStore((state) => state.fetchUserData)
  
  const handleRefreshSelfWatchlist = useCallback(async () => {
    setSelfWatchlistStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([refreshSelfWatchlist(), minimumLoadingTime])
      
      setSelfWatchlistStatus('success')
      await fetchUserData()
      
      toast({
        title: 'Watchlist Refreshed',
        description: 'Your watchlist data has been updated',
        variant: 'default',
      })
      
      return true
    } catch (error) {
      setSelfWatchlistStatus('error')
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh your watchlist data',
        variant: 'destructive',
      })
      console.error('Self watchlist refresh error:', error)
      return false
    }
  }, [refreshSelfWatchlist, fetchUserData, toast])
  
  const handleRefreshOthersWatchlist = useCallback(async () => {
    setOthersWatchlistStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([refreshOthersWatchlist(), minimumLoadingTime])
      
      setOthersWatchlistStatus('success')
      await fetchUserData()
      
      toast({
        title: 'Watchlists Refreshed',
        description: 'Other users\' watchlist data has been updated',
        variant: 'default',
      })
      
      return true
    } catch (error) {
      setOthersWatchlistStatus('error')
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh other users\' watchlist data',
        variant: 'destructive',
      })
      console.error('Others watchlist refresh error:', error)
      return false
    }
  }, [refreshOthersWatchlist, fetchUserData, toast])
  
  const handleRefreshAllWatchlists = useCallback(async () => {
    setSelfWatchlistStatus('loading')
    setOthersWatchlistStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([refreshAllWatchlists(), minimumLoadingTime])
      
      setSelfWatchlistStatus('success')
      setOthersWatchlistStatus('success')
      await fetchUserData()
      
      toast({
        title: 'Watchlists Refreshed',
        description: 'All watchlist data has been updated',
        variant: 'default',
      })
      
      return true
    } catch (error) {
      setSelfWatchlistStatus('error')
      setOthersWatchlistStatus('error')
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh watchlist data',
        variant: 'destructive',
      })
      console.error('All watchlists refresh error:', error)
      return false
    }
  }, [refreshAllWatchlists, fetchUserData, toast])
  
  const handleGenerateRssFeeds = useCallback(async () => {
    setRssStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      await Promise.all([refreshRssFeeds(), minimumLoadingTime])
      
      setRssStatus('success')
      toast({
        title: 'RSS Feeds Generated',
        description: 'RSS feed URLs have been successfully generated',
        variant: 'default',
      })
      
      return true
    } catch (error) {
      setRssStatus('error')
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate RSS feed URLs',
        variant: 'destructive',
      })
      console.error('RSS generation error:', error)
      return false
    }
  }, [refreshRssFeeds, toast])
  
  return {
    selfWatchlistStatus,
    othersWatchlistStatus,
    rssStatus,
    handleRefreshSelfWatchlist,
    handleRefreshOthersWatchlist,
    handleRefreshAllWatchlists,
    handleGenerateRssFeeds,
  }
}