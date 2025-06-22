import { useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import PlexConnectionSection from '@/features/plex/components/connection/connection-section'
import UserTableSection from '@/features/plex/components/user/user-table-section'
import ApprovalTableSection from '@/features/plex/components/approvals/approval-table-section'
import SetupModal from '@/features/plex/components/setup/setup-modal'
import { usePlexSetup } from '@/features/plex/hooks/usePlexSetup'

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

      <h1 className="text-3xl font-bold text-text mb-6">Plex Configuration</h1>

      {/* Plex Connection Section - outside of tabs */}
      <div className="mb-6">
        <PlexConnectionSection />
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
        </TabsList>

        <Separator className="my-4" />

        {/* Users Tab */}
        <TabsContent value="users">
          <UserTableSection />
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals">
          <ApprovalTableSection />
        </TabsContent>
      </Tabs>
    </div>
  )
}
