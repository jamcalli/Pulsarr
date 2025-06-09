import { useState, useEffect } from 'react'
import { DeleteSyncForm } from '@/features/utilities/components/delete-sync/delete-sync-form'
import { DeleteSyncSkeleton } from '@/features/utilities/components/delete-sync/delete-sync-skeleton'
import { PlexNotificationsForm } from '@/features/utilities/components/plex-notifications/plex-notifications-form'
import { PlexNotificationsSkeleton } from '@/features/utilities/components/plex-notifications/plex-notifications-skeleton'
import { UserTagsForm } from '@/features/utilities/components/user-tags/user-tags-form'
import { UserTagsSkeleton } from '@/features/utilities/components/user-tags/user-tags-skeleton'
import { SessionMonitoringForm } from '@/features/utilities/components/session-monitoring/session-monitoring-form'
import { SessionMonitoringSkeleton } from '@/features/utilities/components/session-monitoring/session-monitoring-skeleton'
import { NewUserDefaultsForm } from '@/features/utilities/components/new-user-defaults/new-user-defaults-form'
import { NewUserDefaultsSkeleton } from '@/features/utilities/components/new-user-defaults/new-user-defaults-skeleton'
import { PublicContentNotificationsForm } from '@/features/utilities/components/public-content-notifications/public-content-notifications-form'
import { PublicContentNotificationsSkeleton } from '@/features/utilities/components/public-content-notifications/public-content-notifications-skeleton'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

/**
 * Renders the utilities dashboard with sections for DeleteSync, NewUserDefaults, PublicContentNotifications, PlexNotifications, SessionMonitoring, and UserTags.
 *
 * Displays skeleton placeholders while utility data is loading, then transitions to the corresponding utility forms once loading completes.
 *
 * @returns The utilities dashboard UI.
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
          <NewUserDefaultsSkeleton />
        ) : (
          <NewUserDefaultsForm />
        )}

        {isLoading || loading.schedules ? (
          <PlexNotificationsSkeleton />
        ) : (
          <PlexNotificationsForm />
        )}

        {isLoading || loading.schedules ? (
          <SessionMonitoringSkeleton />
        ) : (
          <SessionMonitoringForm />
        )}

        {isLoading || loading.schedules ? (
          <PublicContentNotificationsSkeleton />
        ) : (
          <PublicContentNotificationsForm />
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
