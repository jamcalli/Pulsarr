import { useEffect, useState } from 'react'
import { NotificationsSection } from '@/features/notifications/components/notifications-section'
import { NotificationsSkeleton } from '@/features/notifications/components/notifications-skeleton'
import { useNotificationsConfig } from '@/features/notifications/hooks/useNotificationsConfig'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

/**
 * Displays the notifications configuration page with a skeleton loader until initialization and a minimum loading delay are complete.
 *
 * Ensures that the notifications settings UI is only shown after both the notification configuration is initialized and a minimum loading period has elapsed, providing a smooth user experience.
 *
 * @returns The notifications configuration page component with loading state management.
 */
export default function NotificationsConfigPage() {
  const { isInitialized } = useNotificationsConfig()

  // Loading state management with minimum delay
  const [isLoading, setIsLoading] = useState(true)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)

  // Setup minimum loading time
  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(() => {
      if (isMounted) {
        setMinLoadingComplete(true)
        if (isInitialized) {
          setIsLoading(false)
        }
      }
    }, MIN_LOADING_DELAY)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [isInitialized])

  // Update loading state when initialized
  useEffect(() => {
    if (isInitialized && minLoadingComplete) {
      setIsLoading(false)
    }
  }, [isInitialized, minLoadingComplete])

  // Show skeleton during loading
  if (isLoading) {
    return (
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <NotificationsSkeleton />
      </div>
    )
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <NotificationsSection isInitialized={isInitialized} />
    </div>
  )
}
