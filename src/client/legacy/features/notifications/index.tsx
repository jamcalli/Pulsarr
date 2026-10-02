import { useConfig } from '@/hooks/useConfig'
import { useShowLoading } from '@/hooks/useMinLoading'
import { PageError } from '@/legacy/components/page-error'
import { NotificationsSection } from '@/legacy/features/notifications/components/notifications-section'
import { NotificationsSkeleton } from '@/legacy/features/notifications/components/notifications-skeleton'

/**
 * Renders the notifications configuration page with a skeleton loader until both initialization and a minimum loading delay are complete.
 *
 * @returns The notifications configuration page component with managed loading state.
 */
export default function NotificationsConfigPage() {
  const { isInitialized, initialize, error: configError } = useConfig()
  const isInitializing = useShowLoading(!isInitialized)

  if (configError && !isInitialized) {
    return <PageError message={configError} onRetry={() => initialize(true)} />
  }

  if (isInitializing) {
    return (
      <div>
        <NotificationsSkeleton />
      </div>
    )
  }

  if (!isInitialized) {
    return null
  }

  return (
    <div>
      <NotificationsSection isInitialized={isInitialized} />
    </div>
  )
}
