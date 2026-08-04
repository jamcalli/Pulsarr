import { PageError } from '@/components/ui/page-error'
import { NotificationsSection } from '@/features/notifications/components/notifications-section'
import { NotificationsSkeleton } from '@/features/notifications/components/notifications-skeleton'
import { useConfig } from '@/hooks/useConfig'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'

/**
 * Renders the notifications configuration page with a skeleton loader until both initialization and a minimum loading delay are complete.
 *
 * @returns The notifications configuration page component with managed loading state.
 */
export default function NotificationsConfigPage() {
  const { isInitialized, initialize, error: configError } = useConfig()
  const isInitializing = useInitializeWithMinDuration(initialize)

  if (configError && !isInitialized) {
    return <PageError message={configError} onRetry={() => initialize(true)} />
  }

  if (isInitializing || !isInitialized) {
    return (
      <div>
        <NotificationsSkeleton />
      </div>
    )
  }

  return (
    <div>
      <NotificationsSection isInitialized={isInitialized} />
    </div>
  )
}
