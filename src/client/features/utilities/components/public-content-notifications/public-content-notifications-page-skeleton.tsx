import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

/**
 * Renders a skeleton placeholder for the Public Content Notifications page layout.
 *
 * Displays static skeleton elements that mimic the structure of the page, including headers, action buttons, informational sections, and configuration forms for Discord Webhook and Apprise integrations. Intended to provide a visual loading state while actual content is being fetched.
 */
export function PublicContentNotificationsPageSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      {/* Header with title and badge */}
      <div className="mb-6">
        <div className="flex items-center">
          <h2 className="text-2xl font-bold text-foreground">
            Public Content Notifications
          </h2>
          <div className="ml-2 inline-flex items-center gap-2 h-full">
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>
        <p className="text-sm text-foreground mt-1">
          Broadcast ALL content availability to public Discord channels and
          shared Apprise endpoints
        </p>
      </div>

      <div className="space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        <Separator />

        {/* Information about public content notifications */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">
            Public Content Broadcasting
          </h3>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        <Separator />

        {/* Configuration form - conditional skeleton (showing enabled state) */}
        <div className="space-y-6">
          {/* Discord Webhook Configuration */}
          <div>
            <h3 className="font-medium text-foreground mb-4">
              Discord Webhook Configuration
            </h3>
            <div className="space-y-4">
              {/* General Discord Webhook URLs */}
              <div className="space-y-1">
                <div className="flex items-center">
                  <span className="text-sm text-foreground">
                    General Discord Webhook URLs
                  </span>
                  <Skeleton className="h-4 w-4 ml-2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>

              {/* Movie-specific Discord Webhook URLs */}
              <div className="space-y-1">
                <div className="flex items-center">
                  <span className="text-sm text-foreground">
                    Movie-specific Discord Webhook URLs
                  </span>
                  <Skeleton className="h-4 w-4 ml-2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>

              {/* Show-specific Discord Webhook URLs */}
              <div className="space-y-1">
                <div className="flex items-center">
                  <span className="text-sm text-foreground">
                    Show-specific Discord Webhook URLs
                  </span>
                  <Skeleton className="h-4 w-4 ml-2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Apprise Configuration */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-medium text-foreground">
                Apprise Configuration
              </h3>
              <span className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-xs">
                Apprise is disabled
              </span>
            </div>
            <div className="space-y-4">
              {/* General Apprise URLs */}
              <div className="space-y-1">
                <div className="flex items-center">
                  <span className="text-sm text-foreground">
                    General Apprise URLs
                  </span>
                  <Skeleton className="h-4 w-4 ml-2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>

              {/* Movie-specific Apprise URLs */}
              <div className="space-y-1">
                <div className="flex items-center">
                  <span className="text-sm text-foreground">
                    Movie-specific Apprise URLs
                  </span>
                  <Skeleton className="h-4 w-4 ml-2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>

              {/* Show-specific Apprise URLs */}
              <div className="space-y-1">
                <div className="flex items-center">
                  <span className="text-sm text-foreground">
                    Show-specific Apprise URLs
                  </span>
                  <Skeleton className="h-4 w-4 ml-2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  )
}
