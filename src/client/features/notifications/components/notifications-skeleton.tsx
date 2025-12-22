import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

/**
 * Displays a skeleton loader for the notifications settings page, providing placeholder elements for all notification sections during data loading.
 *
 * Sections are ordered alphabetically: Apprise, Discord, General, Native Webhooks, Public Content, Tautulli.
 */
export function NotificationsSkeleton() {
  // Use fixed IDs to preserve deep-linking (alphabetically ordered)
  const appriseId = 'apprise-notifications'
  const discordId = 'discord-notifications'
  const generalId = 'general-notifications'
  const nativeWebhooksId = 'native-webhooks'
  const publicContentId = 'public-content-notifications'
  const tautulliId = 'tautulli-notifications'

  return (
    <div className="grid gap-6">
      {/* Feature-specific notification settings info */}
      <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
        <p>
          Some features have their own notification settings. Configure{' '}
          <Link
            to="/approvals/settings"
            className="text-blue-400 hover:text-blue-500"
          >
            Approval Notifications
          </Link>{' '}
          and{' '}
          <Link
            to="/utilities/delete-sync"
            className="text-blue-400 hover:text-blue-500"
          >
            Delete Sync Notifications
          </Link>{' '}
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">
                Apprise Notification Service
              </h3>
              <Skeleton className="h-6 w-16" /> {/* Status badge */}
            </div>
            <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
              <p>
                Apprise is a notification service that can send alerts to
                multiple platforms. The service status is determined at server
                startup and cannot be changed at runtime.{' '}
                <span className="text-blue-400">Click here</span> for setup
                instructions.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-semibold text-foreground">
                  Apprise Server URL
                </span>
                <Skeleton className="h-10 w-full opacity-50" />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-semibold text-foreground">
                  System Apprise URL
                </span>
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Discord Notifications Section */}
      <div id={discordId}>
        <h2 className="text-2xl font-bold text-foreground">
          Discord Notifications
        </h2>

        <div className="grid gap-4 mt-4">
          {/* Discord Webhook Form */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-foreground">
              Discord Webhook
            </h3>
            <div className="space-y-2">
              <span className="text-sm font-semibold text-foreground">
                System Discord Webhook URL(s)
              </span>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-28" />
            </div>
          </div>

          {/* Discord Bot Form */}
          <div className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">
                Discord Bot Settings
              </h3>
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16" /> {/* Status badge */}
                <Skeleton className="h-8 w-12" /> {/* Stop button */}
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-semibold text-foreground">
                  Discord Bot Token
                </span>
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-foreground">
                    Discord Client ID
                  </span>
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-foreground">
                    Discord Guild ID
                  </span>
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
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
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Queue Wait Time (minutes)
              </span>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                New Episode Threshold (hours)
              </span>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Upgrade Buffer Time (seconds)
              </span>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Native Webhooks Section */}
      <div id={nativeWebhooksId}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            Native Webhooks
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <div className="space-y-4">
            <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
              <p>
                Configure webhook endpoints to receive notifications for Pulsarr
                events. Webhooks send JSON payloads to your specified URLs when
                events occur.{' '}
                <a
                  href={api('/api/docs#tag/webhook-payloads')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  View payload schemas →
                </a>
              </p>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-32" /> {/* Add Webhook button */}
            </div>
            {/* Placeholder endpoint cards */}
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <div className="flex gap-1">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-64" />
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
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
          <div className="space-y-4">
            <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
              <p>
                Enable this feature to broadcast ALL content availability to
                public Discord channels and shared Apprise endpoints for
                server-wide announcements.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-20" /> {/* Enable/Disable button */}
            </div>
          </div>
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
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-foreground">
                Tautulli Notification Service
              </h3>
              <Skeleton className="h-6 w-16" /> {/* Status badge */}
            </div>
            <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
              <p>
                Tautulli integration sends native Plex notifications using your
                existing notification agents. This provides a seamless
                notification experience within the Plex ecosystem.{' '}
                <span className="text-blue-400">Click here</span> for setup
                instructions.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" /> {/* Toggle */}
              <span className="text-sm font-medium text-foreground">
                Tautulli Notifications Enabled
              </span>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm font-semibold text-foreground">
                  Tautulli URL
                </span>
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-semibold text-foreground">
                  Tautulli API Key
                </span>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" /> {/* Test button */}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
