import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Skeleton loading component for the User Tags page.
 *
 * Shows placeholder content while the User Tags page loads, including action buttons,
 * configuration switches, and form elements with proper responsive design.
 *
 * @returns A JSX element showing skeleton placeholders for the User Tags page.
 */
export function UserTagsPageSkeleton() {
  const statusInfo = 'unknown' as const

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="User Tags"
        description="Configure user-based tagging for Sonarr and Radarr content"
        status={statusInfo}
      />

      <div className="space-y-6">
        {/* Actions section skeleton */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
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

              {/* Sonarr results */}
              <div className="mt-2">
                <h5 className="text-xs font-medium text-foreground">Sonarr</h5>
                <div className="mt-1 space-y-1">
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>

              {/* Radarr results */}
              <div className="mt-2">
                <h5 className="text-xs font-medium text-foreground">Radarr</h5>
                <div className="mt-1 space-y-1">
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Tag Configuration section skeleton */}
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            Tag Configuration
          </h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="h-5 w-40" />
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

            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-3/4" />
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
