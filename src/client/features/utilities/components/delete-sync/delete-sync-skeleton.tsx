import { Skeleton } from '@/components/ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Clock } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

export function DeleteSyncSkeleton() {
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
          <div className="flex justify-between items-center w-full">
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
                <div className="flex items-center gap-4">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>

              <Separator />

              {/* Status section skeleton */}
              <div>
                <h3 className="font-medium text-text mb-2">Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h3 className="font-medium text-sm text-text mb-1">
                      Status
                    </h3>
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-text mb-1">
                      Last Run
                    </h3>
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <div>
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
                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2 text-text" />
                    <h3 className="font-medium text-sm text-text">Schedule</h3>
                  </div>
                  <Skeleton className="h-10 w-40" />
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
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-sm text-text mb-2">
                    Safety Settings
                  </h3>
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
