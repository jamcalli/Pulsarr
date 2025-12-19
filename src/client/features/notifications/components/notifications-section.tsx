import { useNavigate } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { AppriseForm } from '@/features/notifications/components/apprise/apprise-form'
import { DiscordBotForm } from '@/features/notifications/components/discord/discord-bot-form'
import { DiscordWebhookForm } from '@/features/notifications/components/discord/discord-webhook-form'
import { GeneralSettingsForm } from '@/features/notifications/components/general/general-settings-form'
import { PublicContentForm } from '@/features/notifications/components/public-content/public-content-form'
import { TautulliForm } from '@/features/notifications/components/tautulli/tautulli-form'

interface NotificationsSectionProps {
  isInitialized: boolean
}

/**
 * Displays a sectioned interface for configuring notification settings.
 *
 * Sections are ordered alphabetically: Apprise, Discord, General, Public Content, Tautulli.
 * Each section contains labeled forms for its respective notification integration, separated by visual dividers.
 *
 * @param isInitialized - Indicates whether the notification forms should be initialized.
 */
export function NotificationsSection({
  isInitialized,
}: NotificationsSectionProps) {
  const navigate = useNavigate()

  // Section IDs are stable anchors for deep-linking (alphabetically ordered)
  const appriseId = 'apprise-notifications'
  const discordId = 'discord-notifications'
  const generalId = 'general-notifications'
  const publicContentId = 'public-content-notifications'
  const tautulliId = 'tautulli-notifications'

  return (
    <div className="grid gap-6">
      {/* Feature-specific notification settings info */}
      <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
        <p>
          Some features have their own notification settings. Configure{' '}
          <button
            type="button"
            onClick={() => navigate('/approvals/settings')}
            className="text-blue-400 hover:text-blue-500 cursor-pointer"
          >
            Approval Notifications
          </button>{' '}
          and{' '}
          <button
            type="button"
            onClick={() => navigate('/utilities/delete-sync')}
            className="text-blue-400 hover:text-blue-500 cursor-pointer"
          >
            Delete Sync Notifications
          </button>{' '}
          in their respective settings pages.
        </p>
      </div>

      {/* Apprise Notifications Section */}
      <div id={appriseId}>
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

      {/* Discord Notifications Section */}
      <div id={discordId}>
        <h2 className="text-2xl font-bold text-foreground">
          Discord Notifications
        </h2>
        <div className="grid gap-4 mt-4">
          <DiscordWebhookForm isInitialized={isInitialized} />
          <DiscordBotForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* General Settings Section */}
      <div id={generalId}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            General Settings
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <GeneralSettingsForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Public Content Notifications Section */}
      <div id={publicContentId}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            Public Content Notifications
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <PublicContentForm isInitialized={isInitialized} />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Tautulli Notifications Section */}
      <div id={tautulliId}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            Tautulli Notifications
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <TautulliForm isInitialized={isInitialized} />
        </div>
      </div>
    </div>
  )
}
