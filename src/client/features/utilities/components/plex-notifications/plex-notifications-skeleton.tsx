import { Skeleton } from '@/components/ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'

/**
 * Renders a skeleton UI placeholder for the Plex Notifications interface while data is loading.
 *
 * Simulates the layout of the Plex Notifications feature, including sections for actions, current status, and connection settings, using skeleton elements to indicate loading state.
 *
 * @returns A JSX element representing the loading placeholder for the Plex Notifications UI.
 */
export function PlexNotificationsSkeleton() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="plex-notifications"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <h3 className="text-lg font-medium text-black text-left">
                Plex Notifications
              </h3>
              <p className="text-sm text-black text-left">
                Configure Sonarr and Radarr to notify Plex of content added,
                removed, or modified
              </p>
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-0">
          <div className="p-6 border-t border-border">
            <div className="space-y-6">
              {/* Actions section skeleton */}
              <div>
                <h3 className="font-medium text-text mb-2">Actions</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <Skeleton className="h-8 w-40" />
                </div>
              </div>

              <Separator />

              {/* Status section skeleton */}
              <div>
                <h3 className="font-medium text-text mb-2">Current Status</h3>
                <Skeleton className="h-4 w-3/4 mb-4" />

                <h4 className="font-medium text-sm text-text mb-2">
                  Radarr Instances
                </h4>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>

                <h4 className="font-medium text-sm text-text mt-3 mb-2">
                  Sonarr Instances
                </h4>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>

              <Separator />

              {/* Configuration form skeleton */}
              <div>
                <h3 className="font-medium text-sm text-text mb-2">
                  Plex Connection Settings
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Skeleton className="h-5 w-10 rounded-full" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
