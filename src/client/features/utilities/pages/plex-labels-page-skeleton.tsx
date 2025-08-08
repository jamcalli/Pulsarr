import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a skeleton UI that mimics the layout of the Plex Labels page while content is loading.
 *
 * Renders placeholder elements for all major sections of the Plex Labels page, including headers, action buttons, status indicators, configuration forms, and settings, to provide users with a visual structure during data fetch operations.
 *
 * @returns A JSX element containing skeleton placeholders for the entire Plex Labels page.
 */
export function PlexLabelsPageSkeleton() {
  const statusInfo = 'unknown' as const

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Plex Labels"
        description="Configure user-based labeling for Plex content"
        status={statusInfo}
      />

      <div className="space-y-6">
        {/* Actions section skeleton */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-44" />
          </div>
        </div>

        <Separator />

        {/* Status section skeleton */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Status</h3>
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
            <Skeleton className="h-4 w-3/4 mb-3" />
            <div className="mt-3">
              <h4 className="font-medium text-sm text-foreground mb-1">
                Last Operation Results
              </h4>
              <div className="mt-2">
                <h5 className="text-xs font-medium text-foreground">
                  Plex Sync Results
                </h5>
                <div className="mt-1 space-y-1">
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Full Sync Actions section skeleton */}
        <div>
          <h3 className="font-medium text-foreground mb-2">
            Full Sync Actions
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-32" />
          </div>
        </div>

        <Separator />

        {/* Full Sync Status section skeleton */}
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Schedule Status
              </h3>
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Last Run
              </h3>
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Next Run
              </h3>
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Full Sync Schedule section skeleton */}
        <div>
          <div className="flex items-center mb-3">
            <Skeleton className="h-4 w-4 mr-2" />
            <h3 className="font-medium text-sm text-foreground">
              Full Sync Schedule
            </h3>
          </div>
          <div className="space-y-4">
            <div className="shrink-0">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>

        <Separator />

        {/* Label Configuration section skeleton */}
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            Label Configuration
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Cleanup Settings section skeleton */}
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            Cleanup Settings
          </h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="h-5 w-48" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </div>
  )
}
