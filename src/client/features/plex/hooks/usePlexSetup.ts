import { useState } from 'react'
import { invalidateUserData } from '@/features/plex/hooks/usePlexUsers'
import { refreshRssFeeds, updateConfig } from '@/hooks/useConfig'
import { apiFetch } from '@/lib/tanstackApi'

export function usePlexSetup() {
  const [showSetupModal, setShowSetupModal] = useState(false)

  // Function to handle setting up a new Plex token
  const setupPlexToken = async (token: string) => {
    // Update config with new token
    await updateConfig({
      plexTokens: [token],
    })

    // Sync watchlists
    const [selfWatchlist, othersWatchlist] = await Promise.all([
      apiFetch.GET('/v1/plex/self-watchlist-token'),
      apiFetch.GET('/v1/plex/others-watchlist-token'),
    ])
    if (selfWatchlist.error) throw selfWatchlist.error
    if (othersWatchlist.error) throw othersWatchlist.error

    // Generate RSS feeds
    await refreshRssFeeds()

    // Refresh user data
    await invalidateUserData()
  }

  return {
    showSetupModal,
    setShowSetupModal,
    setupPlexToken,
  }
}
