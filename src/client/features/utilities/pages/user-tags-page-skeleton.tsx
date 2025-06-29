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

      <div className="mt-6 space-y-6">
        {/* Actions section skeleton */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>

        <Separator />

        {/* Configuration form skeleton */}
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
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-10 rounded-full" />
              <Skeleton className="h-5 w-48" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
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
