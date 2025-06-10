import { DiscordWebhookForm } from '@/features/notifications/components/discord/discord-webhook-form'
import { DiscordBotForm } from '@/features/notifications/components/discord/discord-bot-form'
import { AppriseForm } from '@/features/notifications/components/apprise/apprise-form'
import { TautulliForm } from '@/features/notifications/components/tautulli/tautulli-form'
import { GeneralSettingsForm } from '@/features/notifications/components/general/general-settings-form'
import { Separator } from '@/components/ui/separator'
import { useConfigStore } from '@/stores/configStore'
import { useNavigate } from 'react-router-dom'

interface NotificationsSectionProps {
  isInitialized: boolean
}

/**
 * Displays a multi-section interface for configuring notification integrations and settings.
 *
 * Includes forms for Discord, Apprise, Tautulli, and general notification settings, each organized in separate sections with visual separators. Also provides an informational section with a shortcut to public content notification configuration in the Utilities area.
 *
 * @param isInitialized - Controls whether the notification forms are initialized.
 */
export function NotificationsSection({
  isInitialized,
}: NotificationsSectionProps) {
  const setOpenUtilitiesAccordion = useConfigStore(
    (state) => state.setOpenUtilitiesAccordion,
  )
  const navigate = useNavigate()

  return (
    <div className="grid gap-6">
      {/* Public Content Notifications Info Section */}
      <div>
        <div className="text-sm text-text p-3 bg-bw rounded-base border-2 border-border">
          <p>
            Want to broadcast ALL content availability to public Discord
            channels and shared Apprise endpoints? Configure{' '}
            <button
              type="button"
              onClick={() => {
                navigate('/utilities')
                // Set accordion after navigation to ensure the page is loaded
                setTimeout(() => {
                  setOpenUtilitiesAccordion('public-content-notifications')
                }, 100)
              }}
              className="underline font-medium"
            >
              Public Content Notifications
            </button>{' '}
            in the Utilities section.
          </p>
        </div>
      </div>

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

      {/* Tautulli Notifications Section */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-text">
            Tautulli Notifications
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <TautulliForm isInitialized={isInitialized} />
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
