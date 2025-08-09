import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useMediaQuery } from '@/hooks/use-media-query'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a responsive skeleton loader that mimics the layout of the Plex Notifications page during data loading.
 *
 * Shows placeholder elements for the header, actions, current status, and Plex connection settings, adapting the layout for mobile and desktop screens.
 */
export function PlexNotificationsPageSkeleton() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Plex Notifications"
        description="Configure Sonarr and Radarr to notify Plex of content added, removed, or modified"
      />

      <div className="space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-40" />
          </div>
        </div>

        <Separator />

        {/* Status section */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">Current Status</h3>
          <Skeleton className="h-4 w-3/4 mb-3" />

          {/* Radarr instances */}
          <div className="mt-3">
            <h4 className="font-medium text-sm text-foreground mb-2">
              Radarr Instances
            </h4>
            <div className="space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>

          {/* Sonarr instances */}
          <div className="mt-3">
            <h4 className="font-medium text-sm text-foreground mb-2">
              Sonarr Instances
            </h4>
            <div className="space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Configuration form */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-foreground mb-2">
            Plex Connection Settings
          </h3>

          {/* Plex Token Field with Discovery Button */}
          <div className="space-y-2">
            <span className="text-sm text-foreground">Plex Token</span>
            <div className="flex space-x-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>

          {/* Server Selection Cards */}
          <div className="pt-2 pb-4">
            <h4 className="text-sm font-medium text-foreground mb-3">
              Available Servers
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton className="h-32 w-full rounded-md" />
              <Skeleton className="h-32 w-full rounded-md" />
            </div>
          </div>

          {/* Host field */}
          <div className="space-y-2">
            <span className="text-sm text-foreground">Plex Host</span>
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Port and SSL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-sm text-foreground">Plex Port</span>
              <Skeleton className="h-10 w-full" />
            </div>
            <div
              className={`flex items-center space-x-2 ${isMobile ? '' : 'pt-8'}`}
            >
              <Skeleton className="h-5 w-10 rounded-full" />
              <span className="text-sm text-foreground">Use SSL</span>
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
