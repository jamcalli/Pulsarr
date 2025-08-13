import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Renders a controlled accordion skeleton representing the loading state of the User Tags interface.
 *
 * Displays placeholder elements for action buttons and tag configuration fields within an accordion layout, visually indicating that the User Tags feature is loading.
 *
 * @returns A JSX element showing skeleton placeholders for the User Tags UI.
 */
export function UserTagsSkeleton() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="user-tags"
        className="border-2 border-border rounded-base overflow-hidden"
        data-accordion-value="user-tags"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <h3 className="text-lg font-medium text-black text-left">
                User Tags
              </h3>
              <p className="text-sm text-black text-left">
                Configure user-based tagging for Sonarr and Radarr content
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
                <h3 className="font-medium text-black mb-2">Actions</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>

              <Separator />

              {/* Configuration form skeleton */}
              <div>
                <h3 className="font-medium text-sm text-black mb-2">
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
