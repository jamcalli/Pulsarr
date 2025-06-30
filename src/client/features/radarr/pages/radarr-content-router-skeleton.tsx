import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

/**
 * Renders a skeleton loader UI that mimics the Radarr Content Router page layout while content is loading.
 *
 * The skeleton includes placeholders for headers, route cards, settings, conditions, and action buttons, providing a visual structure similar to the final page.
 *
 * @returns A JSX element displaying skeleton placeholders for the Radarr Content Router page.
 */
export function RadarrContentRouterSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <Skeleton className="h-8 w-64 mb-1" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <div className="space-y-6">
        {/* Route Cards */}
        {Array.from({ length: 2 }, (_, index) => `skeleton-${index}`).map(
          (skeletonId) => (
            <div
              key={skeletonId}
              className="border-2 border-border rounded-base overflow-hidden"
            >
              {/* Route Header */}
              <div className="px-6 py-4 bg-main">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-5 w-5 rounded-full" />
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </div>

              {/* Route Content */}
              <div className="p-6 border-t border-border space-y-4">
                {/* Basic Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>

                <Separator />

                {/* Conditions Section */}
                <div className="space-y-4">
                  <Skeleton className="h-5 w-20" />
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-4 w-4" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
