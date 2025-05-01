import { useState, useEffect } from 'react'
import { DeleteSyncForm } from '@/features/utilities/components/delete-sync/delete-sync-form'
import { DeleteSyncSkeleton } from '@/features/utilities/components/delete-sync/delete-sync-skeleton'
import { PlexNotificationsForm } from '@/features/utilities/components/plex-notifications/plex-notifications-form'
import { PlexNotificationsSkeleton } from '@/features/utilities/components/plex-notifications/plex-notifications-skeleton'
import { UserTagsForm } from '@/features/utilities/components/user-tags/user-tags-form'
import { UserTagsSkeleton } from '@/features/utilities/components/user-tags/user-tags-skeleton'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

/**
 * Displays the utilities dashboard with sections for DeleteSync, PlexNotifications, and UserTags.
 *
 * Shows skeleton placeholders during loading and transitions smoothly to the utility forms once data is ready, preventing UI flicker.
 *
 * @returns The rendered utilities dashboard UI.
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

        {isLoading || loading.schedules ? (
          <UserTagsSkeleton />
        ) : (
          <UserTagsForm />
        )}
      </div>
    </div>
  )
}
