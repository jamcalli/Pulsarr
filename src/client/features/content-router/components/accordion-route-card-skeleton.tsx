import { Skeleton } from '@/components/ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export const AccordionRouteCardSkeleton = () => {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="route"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-6 w-48" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-0">
          <div className="p-6 border-t border-border">
            <div className="space-y-6">
              {/* Actions section skeleton */}
              <div>
                <h3 className="font-medium text-text mb-2">Actions</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>

              {/* Conditions Section Header */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-28" /> {/* Conditions Label */}
                  <Skeleton className="h-4 w-4" /> {/* Help icon */}
                </div>

                {/* Conditions */}
                <div className="space-y-3">
                  {/* Condition 1 */}
                  <div className="p-3 border rounded-md">
                    <div className="flex flex-wrap gap-3">
                      <div className="flex-1 min-w-[150px]">
                        <Skeleton className="h-3 w-16 mb-1" />{' '}
                        {/* Field label */}
                        <Skeleton className="h-10 w-full" />{' '}
                        {/* Field select */}
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <Skeleton className="h-3 w-16 mb-1" />{' '}
                        {/* Operator label */}
                        <Skeleton className="h-10 w-full" />{' '}
                        {/* Operator select */}
                      </div>
                      <div className="flex-[2] min-w-[200px]">
                        <Skeleton className="h-3 w-16 mb-1" />{' '}
                        {/* Value label */}
                        <Skeleton className="h-10 w-full" /> {/* Value input */}
                      </div>
                      <div className="flex items-end space-x-1 pb-1">
                        <Skeleton className="h-9 w-12" /> {/* NOT button */}
                        <Skeleton className="h-9 w-9" /> {/* Delete button */}
                      </div>
                    </div>
                  </div>

                  {/* Condition 2 */}
                  <div className="p-3 border rounded-md">
                    <div className="flex flex-wrap gap-3">
                      <div className="flex-1 min-w-[150px]">
                        <Skeleton className="h-3 w-16 mb-1" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <Skeleton className="h-3 w-16 mb-1" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                      <div className="flex-[2] min-w-[200px]">
                        <Skeleton className="h-3 w-16 mb-1" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                      <div className="flex items-end space-x-1 pb-1">
                        <Skeleton className="h-9 w-12" />
                        <Skeleton className="h-9 w-9" />
                      </div>
                    </div>
                  </div>

                  {/* Add Condition Button */}
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>

              {/* Priority Slider */}
              <div>
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-4 w-28" /> {/* Label */}
                  <Skeleton className="h-4 w-8" /> {/* Value */}
                </div>
                <Skeleton className="h-4 w-full mb-1" /> {/* Slider */}
                <Skeleton className="h-3 w-64" /> {/* Description */}
              </div>

              {/* Instance and Root Folder */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" /> {/* Label */}
                  <Skeleton className="h-10 w-full" /> {/* Select */}
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" /> {/* Label */}
                  <Skeleton className="h-10 w-full" /> {/* Select */}
                </div>
              </div>

              {/* Quality Profile */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" /> {/* Label */}
                <Skeleton className="h-10 w-full" /> {/* Select */}
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export default AccordionRouteCardSkeleton
