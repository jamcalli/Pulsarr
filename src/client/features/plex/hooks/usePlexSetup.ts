import { useState } from 'react'
import { apiFetch } from '@/lib/tanstackApi'
import { useConfigStore } from '@/stores/configStore'

export function usePlexSetup() {
  const [showSetupModal, setShowSetupModal] = useState(false)
  const updateConfig = useConfigStore((state) => state.updateConfig)
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const refreshRssFeeds = useConfigStore((state) => state.refreshRssFeeds)

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
    await fetchUserData()
  }

  return {
    showSetupModal,
    setShowSetupModal,
    setupPlexToken,
  }
}
