import { useNavigate } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { AppriseForm } from '@/features/notifications/components/apprise/apprise-form'
import { DiscordBotForm } from '@/features/notifications/components/discord/discord-bot-form'
import { DiscordWebhookForm } from '@/features/notifications/components/discord/discord-webhook-form'
import { GeneralSettingsForm } from '@/features/notifications/components/general/general-settings-form'
import { TautulliForm } from '@/features/notifications/components/tautulli/tautulli-form'

interface NotificationsSectionProps {
  isInitialized: boolean
}

/**
 * Displays a sectioned interface for configuring Discord, Apprise, Tautulli, and general notification settings.
 *
 * Each section contains labeled forms for its respective notification integration, separated by visual dividers. An informational area provides a link to the Public Content Notifications configuration page.
 *
 * @param isInitialized - Indicates whether the notification forms should be initialized.
 */
export function NotificationsSection({
  isInitialized,
}: NotificationsSectionProps) {
  const navigate = useNavigate()

  return (
    <div className="grid gap-6">
      {/* Public Content Notifications Info Section */}
      <div>
        <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
          <p>
            Want to broadcast ALL content availability to public Discord
            channels and shared Apprise endpoints? Configure{' '}
            <button
              type="button"
              onClick={() =>
                navigate('/utilities/public-content-notifications')
              }
              className="underline font-medium hover:opacity-80 cursor-pointer"
            >
              Public Content Notifications
            </button>{' '}
            in the Utilities section.
          </p>
        </div>
      </div>

      {/* Discord Notifications Section */}
      <div id="discord-notifications">
        <h2 className="text-2xl font-bold text-foreground">
          Discord Notifications
        </h2>

        {/* Discord Webhook Section */}
        <div className="grid gap-4 mt-4">
          <DiscordWebhookForm isInitialized={isInitialized} />
          <DiscordBotForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Apprise Notifications Section */}
      <div id="apprise-notifications">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            Apprise Notifications
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <AppriseForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Tautulli Notifications Section */}
      <div id="tautulli-notifications">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            Tautulli Notifications
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <TautulliForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* General Notifications Section */}
      <div id="general-notifications">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
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
