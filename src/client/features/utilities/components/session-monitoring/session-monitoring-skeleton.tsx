import { Skeleton } from '@/components/ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'

/**
 * Renders a skeleton loading UI for the "Plex Session Monitoring" feature.
 *
 * This component displays a collapsible accordion card with placeholder elements
 * mimicking the layout of the Session Monitoring interface. It includes skeletons for the title,
 * description, actions, and configuration settings, providing a visual cue while the actual
 * data is being loaded.
 *
 * @returns A JSX element representing the loading state of the Session Monitoring feature.
 */
export function SessionMonitoringSkeleton() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="session-monitoring"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <h3 className="text-lg font-medium text-text text-left">
                Plex Session Monitoring
              </h3>
              <p className="text-sm text-text text-left">
                Monitor Plex viewing sessions and automatically expand Sonarr
                monitoring
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
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>

              <Separator />

              {/* Configuration form skeleton */}
              <div>
                <h3 className="font-medium text-sm text-text mb-2">
                  Monitoring Configuration
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-80" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-28" />
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
