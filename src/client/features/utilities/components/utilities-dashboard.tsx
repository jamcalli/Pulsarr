import { useState, useEffect } from 'react'
import { DeleteSyncForm } from '@/features/utilities/components/delete-sync/delete-sync-form'
import { DeleteSyncSkeleton } from '@/features/utilities/components/delete-sync/delete-sync-skeleton'
import { PlexNotificationsForm } from '@/features/utilities/components/plex-notifications/plex-notifications-form'
import { PlexNotificationsSkeleton } from '@/features/utilities/components/plex-notifications/plex-notifications-skeleton'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

/**
 * Renders a utilities dashboard that displays various utility components.
 *
 * This component manages a smooth transition from a loading state to the fully rendered UI.
 * It monitors the global loading state and applies a delay before removing the local loading state
 * to prevent UI flickering. Currently includes the DeleteSync and PlexNotifications components.
 *
 * @returns A React element representing the utilities dashboard.
 */
export function UtilitiesDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const loading = useUtilitiesStore((state) => state.loading)
  const hasLoadedSchedules = useUtilitiesStore(
    (state) => state.hasLoadedSchedules,
  )

  useEffect(() => {
    if (hasLoadedSchedules) {
      // Add a small delay to ensure smooth transitions
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [hasLoadedSchedules])

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <h2 className="mb-6 text-2xl font-bold text-text">Utilities</h2>

      <div className="space-y-6">
        {isLoading || loading.schedules ? (
          <DeleteSyncSkeleton />
        ) : (
          <DeleteSyncForm />
        )}

        {isLoading || loading.schedules ? (
          <PlexNotificationsSkeleton />
        ) : (
          <PlexNotificationsForm />
        )}
      </div>
    </div>
  )
}
