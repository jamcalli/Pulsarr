import { useState } from 'react'
import { api } from '@/lib/api'
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
    await Promise.all([
      fetch(api('/v1/plex/self-watchlist-token'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
      fetch(api('/v1/plex/others-watchlist-token'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    ])

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
