import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a skeleton placeholder for the Plex Session Monitoring page while data is loading.
 *
 * This component visually represents all major sections of the page—including headers, configuration inputs, user filtering, auto-reset settings, status panels, informational text, and action buttons—using skeleton elements to indicate loading states.
 */
export function PlexSessionMonitoringPageSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Plex Session Monitoring"
        description="Monitor Plex viewing sessions and automatically expand Sonarr monitoring"
      />

      <div className="space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        <Separator />

        {/* Monitoring Configuration section */}
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            Monitoring Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-sm text-foreground">
                Polling Interval (minutes)
              </span>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <span className="text-sm text-foreground">
                Remaining Episodes Threshold
              </span>
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>

        <Separator />

        {/* User Filtering section */}
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            User Filtering
          </h3>
          <div className="space-y-2">
            <span className="text-sm text-foreground">Filter Users</span>
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        <Separator />

        {/* Auto-Reset Settings section */}
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            Auto-Reset Settings
          </h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <span className="text-sm text-foreground">Enable Auto-Reset</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-sm text-foreground">
                  Inactivity Reset Days
                </span>
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <span className="text-sm text-foreground">
                  Auto-Reset Interval (hours)
                </span>
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <span className="text-sm text-foreground">
                Enable Progressive Cleanup
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Status and Management section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm text-foreground">
              Rolling Monitoring Status
            </h3>
            <Skeleton className="h-7 w-28" />
          </div>
          <div className="space-y-4">
            {/* Rolling Shows */}
            <div>
              <h4 className="font-medium text-sm text-foreground mb-2">
                Rolling Shows
              </h4>
              <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
              </div>
            </div>

            {/* Inactive Shows */}
            <div>
              <h4 className="font-medium text-sm text-foreground mb-2">
                Inactive Shows
              </h4>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-foreground">
                  Inactivity Days:
                </span>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-24" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Information section */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">
            Rolling Monitoring Options
          </h3>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    </div>
  )
}
