import { DiscordWebhookForm } from '@/features/notifications/components/discord/discord-webhook-form'
import { DiscordBotForm } from '@/features/notifications/components/discord/discord-bot-form'
import { AppriseForm } from '@/features/notifications/components/apprise/apprise-form'
import { GeneralSettingsForm } from '@/features/notifications/components/general/general-settings-form'
import { Separator } from '@/components/ui/separator'

interface NotificationsSectionProps {
  isInitialized: boolean
}

export function NotificationsSection({
  isInitialized,
}: NotificationsSectionProps) {
  return (
    <div className="grid gap-6">
      {/* Discord Notifications Section */}
      <div>
        <h2 className="text-2xl font-bold text-text">Discord Notifications</h2>

        {/* Discord Webhook Section */}
        <div className="grid gap-4 mt-4">
          <DiscordWebhookForm isInitialized={isInitialized} />
          <DiscordBotForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Apprise Notifications Section */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-text">
            Apprise Notifications
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <AppriseForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* General Notifications Section */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-text">
            General Notification Settings
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <GeneralSettingsForm isInitialized={isInitialized} />
        </div>
      </div>
    </div>
  )
}
