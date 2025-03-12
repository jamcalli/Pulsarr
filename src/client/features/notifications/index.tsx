import { NotificationsSection } from '@/features/notifications/components/notifications-section'
import { useNotificationsConfig } from '@/features/notifications/hooks/useNotificationsConfig'

export default function NotificationsConfigPage() {
  const { isInitialized } = useNotificationsConfig()

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <NotificationsSection isInitialized={isInitialized} />
    </div>
  )
}
