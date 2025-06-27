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
import { useConfigStore } from '@/stores/configStore'

/**
 * Displays the utilities dashboard with sections for DeleteSync, NewUserDefaults, PublicContentNotifications, PlexNotifications, SessionMonitoring, and UserTags.
 *
 * Shows skeleton placeholders while utility data is loading, then transitions to the corresponding utility forms. If a specific section is requested via navigation, automatically scrolls to and expands that section after loading completes.
 *
 * @returns The rendered utilities dashboard UI.
 */
export function UtilitiesDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const loading = useUtilitiesStore((state) => state.loading)
  const hasLoadedSchedules = useUtilitiesStore(
    (state) => state.hasLoadedSchedules,
  )
  const openUtilitiesAccordion = useConfigStore(
    (state) => state.openUtilitiesAccordion,
  )
  const setOpenUtilitiesAccordion = useConfigStore(
    (state) => state.setOpenUtilitiesAccordion,
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

  // Handle controlled accordion opening with scroll for navigation-triggered opens
  useEffect(() => {
    if (openUtilitiesAccordion && !isLoading) {
      // Scroll to accordion after it opens
      setTimeout(() => {
        const accordionElement = document.querySelector(
          `[data-accordion-value="${openUtilitiesAccordion}"]`,
        )
        if (accordionElement) {
          accordionElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
        // Clear the state after navigation to prevent sticky behavior
        setOpenUtilitiesAccordion(null)
      }, 300) // Give accordion time to open
    }
  }, [openUtilitiesAccordion, isLoading, setOpenUtilitiesAccordion])

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <h2 className="mb-6 text-2xl font-bold text-foreground">Utilities</h2>

      <div className="space-y-6">
        <div id="delete-sync">
          {isLoading || loading.schedules ? (
            <DeleteSyncSkeleton />
          ) : (
            <DeleteSyncForm />
          )}
        </div>

        <div id="new-user-defaults">
          {isLoading || loading.schedules ? (
            <NewUserDefaultsSkeleton />
          ) : (
            <NewUserDefaultsForm />
          )}
        </div>

        <div id="plex-notifications">
          {isLoading || loading.schedules ? (
            <PlexNotificationsSkeleton />
          ) : (
            <PlexNotificationsForm />
          )}
        </div>

        <div id="plex-session-monitoring">
          {isLoading || loading.schedules ? (
            <SessionMonitoringSkeleton />
          ) : (
            <SessionMonitoringForm />
          )}
        </div>

        <div id="public-content-notifications">
          {isLoading || loading.schedules ? (
            <PublicContentNotificationsSkeleton />
          ) : (
            <PublicContentNotificationsForm />
          )}
        </div>

        <div id="user-tags">
          {isLoading || loading.schedules ? (
            <UserTagsSkeleton />
          ) : (
            <UserTagsForm />
          )}
        </div>
      </div>
    </div>
  )
}
