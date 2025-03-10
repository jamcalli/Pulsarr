import { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePlexStore } from '@/features/plex/store/plexStore'
import { PlexInstanceCard } from '@/features/plex/components/instance/plex-instance-card'
import { PlexUserTable } from '@/features/plex/components/user/plex-user-table'
import { PlexInstanceSkeleton } from '@/features/plex/components/instance/plex-instance-skeleton'

export default function PlexConfigPage() {
  const isInitialized = usePlexStore((state) => state.isInitialized)
  const isLoading = usePlexStore((state) => state.isLoading)
  const initialize = usePlexStore((state) => state.initialize)
  const config = usePlexStore((state) => state.config)
  
  const initializeRef = useRef(false)

  useEffect(() => {
    if (!initializeRef.current) {
      initializeRef.current = true
      initialize(true)
    }
  }, [initialize])

  if (!isInitialized && isLoading) {
    return (
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">Plex Integration</h2>
          </div>
          <PlexInstanceSkeleton />
          
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-text">User Watchlists</h2>
            </div>
            <div className="grid gap-4 mt-4">
              <div className="text-center py-8 text-text text-muted-foreground">
                Loading user data...
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Get token status - show setup notice if needed
  const hasPlexToken = config?.plexTokens && config.plexTokens.length > 0

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="grid gap-6">
        <div>
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">Plex Integration</h2>
          </div>
          <div className="grid gap-4 mt-4">
            <PlexInstanceCard />
          </div>
        </div>
        
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-text">User Watchlists</h2>
          </div>
          <div className="grid gap-4 mt-4">
            {!hasPlexToken ? (
              <Card>
                <CardHeader>
                  <CardTitle>No Plex Connection</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-center py-4 text-text">
                    Please set up your Plex connection above to access watchlist data.
                  </p>
                </CardContent>
              </Card>
            ) : isLoading ? (
              <div className="text-center py-8 text-text text-muted-foreground">
                Loading user data...
              </div>
            ) : (
              <PlexUserTable />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}