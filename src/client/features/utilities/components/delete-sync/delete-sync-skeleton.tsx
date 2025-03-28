import { Skeleton } from '@/components/ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Clock } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { useMediaQuery } from '@/hooks/use-media-query'

/**
 * Renders a skeleton loading UI for the "Delete Sync" feature.
 *
 * This component displays a collapsible accordion card with placeholder elements
 * mimicking the layout of the Delete Sync interface. It includes skeletons for the title,
 * description, actions, status indicators, schedule, configuration, and safety settings,
 * providing a visual cue while the actual data is being loaded. The component is responsive
 * and adapts its layout for mobile and desktop views.
 *
 * @returns A JSX element representing the loading state of the Delete Sync feature.
 */
export function DeleteSyncSkeleton() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="delete-sync"
      className="w-full"
    >
      <AccordionItem
        value="delete-sync"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <h3 className="text-lg font-medium text-text text-left">
                Delete Sync
              </h3>
              <p className="text-sm text-text text-left">
                Automatically removes content when it's no longer on any
                watchlists
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
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>

              <Separator />

              {/* Status section skeleton */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col items-center text-center">
                    <h3 className="font-medium text-sm text-text mb-1">
                      Status
                    </h3>
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <h3 className="font-medium text-sm text-text mb-1">
                      Last Run
                    </h3>
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <h3 className="font-medium text-sm text-text mb-1">
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
                  <Clock className="h-4 w-4 mr-2 text-text" />
                  <h3 className="font-medium text-sm text-text">Schedule</h3>
                </div>

                <div
                  className={
                    isMobile
                      ? 'flex flex-col items-start gap-3'
                      : 'flex items-center gap-4'
                  }
                >
                  <Skeleton className="h-10 w-40" />
                  {!isMobile && <Skeleton className="h-10 w-40" />}
                  {isMobile && <Skeleton className="h-10 w-40 mt-2" />}
                </div>

                <div className="mt-2">
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>

              <Separator />

              {/* Configuration skeleton */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-sm text-text mb-2">
                    Configuration
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Skeleton className="h-5 w-10 rounded-full" />
                      <Skeleton className="h-5 w-32" />
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
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-sm text-text mb-2">
                    Safety Settings
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Skeleton className="h-5 w-10 rounded-full" />
                      <Skeleton className="h-5 w-40" />
                    </div>

                    <div
                      className={
                        isMobile
                          ? 'flex flex-col space-y-2'
                          : 'flex items-center justify-between'
                      }
                    >
                      <Skeleton className="h-5 w-32" />
                      <Skeleton
                        className={isMobile ? 'h-9 w-full mt-2' : 'h-9 w-40'}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-9 w-20" />
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
