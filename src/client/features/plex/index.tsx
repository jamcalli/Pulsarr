import { useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import PlexConnectionSection from './components/connection/connection-section'
import WatchlistStatsSection from './components/watchlist/watchlist-stats'
import UserTableSection from './components/user/user-table-section'
import SetupModal from './components/setup/setup-modal'
import { usePlexSetup } from './hooks/usePlexSetup'

export default function PlexConfigPage() {
  const config = useConfigStore((state) => state.config)
  const initialize = useConfigStore((state) => state.initialize)
  const { showSetupModal, setShowSetupModal } = usePlexSetup()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Check if Plex token is missing and show setup modal
  useEffect(() => {
    if (config && (!config.plexTokens || config.plexTokens.length === 0)) {
      setShowSetupModal(true)
    }
  }, [config, setShowSetupModal])

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <SetupModal open={showSetupModal} onOpenChange={setShowSetupModal} />

      <div className="grid gap-6">
        {/* Plex Connection Section */}
        <PlexConnectionSection />

        {/* Watchlist Stats Section */}
        <WatchlistStatsSection />

        {/* User Table Section */}
        <UserTableSection />
      </div>
    </div>
  )
}
