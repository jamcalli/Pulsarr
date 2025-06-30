import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useMediaQuery } from '@/hooks/use-media-query'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a skeleton placeholder UI for the Quota Settings page while content is loading.
 *
 * Renders placeholder elements for all major sections of the Quota Settings page, including actions, status, schedule, reset policies, and cleanup settings. The layout adapts responsively for mobile and desktop screens.
 *
 * @returns A JSX element containing skeleton placeholders for the Quota Settings page.
 */
export function QuotaSettingsPageSkeleton() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Quota Settings"
        description="Manages quota reset policies and maintenance scheduling"
        status="unknown"
      />

      <div className="mt-6 space-y-6">
        {/* Actions section skeleton */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        <Separator />

        {/* Status section skeleton */}
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Status
              </h3>
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Last Run
              </h3>
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Next Scheduled Run
              </h3>
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Schedule section skeleton */}
        <div>
          <div className="flex items-center mb-3">
            <Skeleton className="h-4 w-4 mr-2" />
            <h3 className="font-medium text-sm text-foreground">Schedule</h3>
          </div>
          <div className={isMobile ? 'space-y-3' : 'flex items-center gap-4'}>
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>

        <Separator />

        {/* Configuration sections skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-medium text-sm text-foreground mb-2">
              Reset Policies
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-10 w-48" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-sm text-foreground mb-2">
              Cleanup Settings
            </h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Skeleton className="h-5 w-10 rounded-full" />
                <Skeleton className="h-5 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-10 w-48" />
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons skeleton */}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </div>
  )
}
