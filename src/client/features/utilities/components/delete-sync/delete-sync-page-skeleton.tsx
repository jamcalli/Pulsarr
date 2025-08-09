import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useMediaQuery } from '@/hooks/use-media-query'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a skeleton loader that mimics the layout of the Delete Sync page while data is loading.
 *
 * Shows placeholder elements for all primary sections, including the header, actions, status, schedule, deletion mode, safety settings, and footer actions. The layout adjusts responsively for mobile and desktop viewports.
 */
export function DeleteSyncPageSkeleton() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Delete Sync"
        description="Automatically removes content when it's no longer on any watchlists"
      />

      <div className="space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        <Separator />

        {/* Status section */}
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
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex flex-col items-center text-center">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Next Scheduled Run
              </h3>
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Schedule section */}
        <div>
          <div className="flex items-center mb-3">
            <Skeleton className="h-4 w-4 mr-2" />
            <h3 className="font-medium text-sm text-foreground">Schedule</h3>
          </div>
          <div
            className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-4`}
          >
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-medium text-sm text-foreground mb-2">
              Deletion Mode
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-sm text-foreground">Mode</span>
                <Skeleton className="h-10 w-full" />
              </div>

              <h3 className="font-medium text-sm text-foreground mt-4 mb-2">
                Configuration
              </h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <span className="text-sm text-foreground">Delete Movies</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <span className="text-sm text-foreground">
                    Delete Ended Shows
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <span className="text-sm text-foreground">
                    Delete Continuing Shows
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <span className="text-sm text-foreground">Delete Files</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-sm text-foreground mb-2">
              Safety Settings
            </h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Skeleton className="h-5 w-10 rounded-full" />
                <span className="text-sm text-foreground">
                  Respect User Sync Settings
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Skeleton className="h-5 w-10 rounded-full" />
                <span className="text-sm text-foreground">
                  Enable Plex Playlist Protection
                </span>
              </div>
              <div className="space-y-2">
                <span className="text-sm text-foreground">
                  Protection Playlist Name
                </span>
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <span className="text-sm text-foreground">Notifications</span>
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="flex items-center space-x-2">
                <Skeleton className="h-5 w-10 rounded-full" />
                <span className="text-sm text-foreground">
                  Only Notify When Items Deleted
                </span>
              </div>
              <div className="space-y-2">
                <span className="text-sm text-foreground">
                  Max Deletion Prevention (%)
                </span>
                <Skeleton className="h-10 w-20" />
              </div>
            </div>
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
