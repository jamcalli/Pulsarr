import { useId } from 'react'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Displays a skeleton loader for the notifications settings page, providing placeholder elements for all notification sections during data loading.
 *
 * This component visually mimics the layout of the notifications page, including sections for Discord, Apprise, Tautulli, and general notification settings, using skeleton placeholders for headings, inputs, buttons, badges, toggles, and informational text.
 */
export function NotificationsSkeleton() {
  const discordId = useId()
  const appriseId = useId()
  const tautulliId = useId()
  const generalId = useId()
  return (
    <div className="grid gap-6">
      {/* Public Content Notifications Info Section - Static */}
      <div>
        <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
          <p>
            Want to broadcast ALL content availability to public Discord
            channels and shared Apprise endpoints? Configure{' '}
            <button
              type="button"
              className="underline font-medium hover:opacity-80 cursor-pointer"
            >
              Public Content Notifications
            </button>{' '}
            in the Utilities section.
          </p>
        </div>
      </div>

      {/* Discord Notifications Section */}
      <div id={discordId}>
        <h2 className="text-2xl font-bold text-foreground">
          Discord Notifications
        </h2>

        <div className="grid gap-4 mt-4">
          {/* Discord Webhook Form */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" /> {/* Discord Webhook */}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />{' '}
              {/* System Discord Webhook URL(s) */}
              <Skeleton className="h-20 w-full" /> {/* Multi-input field */}
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-24" /> {/* Save Changes */}
            </div>
          </div>

          {/* Discord Bot Form */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-36" /> {/* Discord Bot Settings */}
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16" /> {/* Running badge */}
                <Skeleton className="h-8 w-12" /> {/* Stop button */}
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" /> {/* Discord Bot Token */}
                <Skeleton className="h-10 w-full" /> {/* Token input */}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" /> {/* Discord Client ID */}
                  <Skeleton className="h-10 w-full" /> {/* Client ID input */}
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" /> {/* Discord Guild ID */}
                  <Skeleton className="h-10 w-full" /> {/* Guild ID input */}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-24" /> {/* Save Changes */}
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

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
              <Skeleton className="h-6 w-48" />{' '}
              {/* Apprise Notification Service */}
              <Skeleton className="h-6 w-16" /> {/* Disabled badge */}
            </div>
            <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border border-border">
              <p>
                Apprise is a notification service that can send alerts to
                multiple platforms. The service status is determined at server
                startup and cannot be changed at runtime.{' '}
                <span className="underline font-medium">
                  Click here for setup instructions.
                </span>
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" /> {/* Apprise Server URL */}
                <Skeleton className="h-10 w-full opacity-50" />{' '}
                {/* Disabled input */}
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" /> {/* System Apprise URL */}
                <Skeleton className="h-20 w-full" /> {/* Multi-input field */}
                <Skeleton className="h-4 w-full max-w-sm" />{' '}
                {/* Examples text */}
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-24" /> {/* Save Changes */}
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-48" />{' '}
                {/* Tautulli Notification Service */}
                <Skeleton className="h-6 w-16" /> {/* Running badge */}
              </div>
            </div>
            <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border border-border">
              <p>
                Tautulli integration sends native Plex notifications using your
                existing notification agents. This provides a seamless
                notification experience within the Plex ecosystem.{' '}
                <span className="underline font-medium">
                  Click here for setup instructions.
                </span>
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" />{' '}
              {/* Toggle switch */}
              <div className="flex items-center gap-1">
                <Skeleton className="h-4 w-48" />{' '}
                {/* Tautulli Notifications Enabled */}
                <Skeleton className="h-4 w-4 rounded-full" /> {/* Info icon */}
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" /> {/* Tautulli URL */}
                <Skeleton className="h-10 w-full" /> {/* URL input */}
                <Skeleton className="h-4 w-full max-w-xs" />{' '}
                {/* Example text */}
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-4 w-28" /> {/* Tautulli API Key */}
                  <Skeleton className="h-4 w-4 rounded-full" />{' '}
                  {/* Info icon */}
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" /> {/* API Key input */}
                  <Skeleton className="h-10 w-16" /> {/* Test button */}
                </div>
                <Skeleton className="h-4 w-full max-w-xs" />{' '}
                {/* Found in Tautulli Settings text */}
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-24" /> {/* Save Changes */}
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* General Notifications Section */}
      <div id={generalId}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            General Notification Settings
          </h2>
        </div>
        <div className="grid gap-4 mt-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-4 w-40" />{' '}
                  {/* Queue Wait Time (minutes) */}
                  <Skeleton className="h-4 w-4 rounded-full" />{' '}
                  {/* Info icon */}
                </div>
                <Skeleton className="h-10 w-full" /> {/* Number input */}
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-4 w-48" />{' '}
                  {/* New Episode Threshold (hours) */}
                  <Skeleton className="h-4 w-4 rounded-full" />{' '}
                  {/* Info icon */}
                </div>
                <Skeleton className="h-10 w-full" /> {/* Number input */}
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-4 w-48" />{' '}
                  {/* Upgrade Buffer Time (seconds) */}
                  <Skeleton className="h-4 w-4 rounded-full" />{' '}
                  {/* Info icon */}
                </div>
                <Skeleton className="h-10 w-full" /> {/* Number input */}
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-9 w-24" /> {/* Save Changes */}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
