import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

/**
 * Skeleton loader for the notifications page showing placeholders for all notification sections.
 */
export function NotificationsSkeleton() {
  return (
    <div className="grid gap-6">
      {/* Public Content Notifications Info Section - Static */}
      <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
        <p>
          Want to broadcast ALL content availability to public Discord channels
          and shared Apprise endpoints? Configure{' '}
          <span className="underline font-medium">
            Public Content Notifications
          </span>{' '}
          in the Utilities section.
        </p>
      </div>

      {/* Discord Notifications Section */}
      <div id="discord-notifications">
        <h2 className="text-2xl font-bold text-foreground">
          Discord Notifications
        </h2>
        <div className="grid gap-4 mt-4">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Apprise Notifications Section */}
      <div id="apprise-notifications">
        <h2 className="text-2xl font-bold text-foreground">
          Apprise Notifications
        </h2>
        <div className="grid gap-4 mt-4">
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Tautulli Notifications Section */}
      <div id="tautulli-notifications">
        <h2 className="text-2xl font-bold text-foreground">
          Tautulli Notifications
        </h2>
        <div className="grid gap-4 mt-4">
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>

      <Separator className="my-4" />

      {/* General Notifications Section */}
      <div id="general-notifications">
        <h2 className="text-2xl font-bold text-foreground">
          General Notification Settings
        </h2>
        <div className="grid gap-4 mt-4">
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>
    </div>
  )
}
