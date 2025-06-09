import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Renders a skeleton UI for the "New User Defaults" form, providing a visual placeholder during loading states.
 *
 * The skeleton mimics the layout of the form, including header, description, and input fields, using an accordion structure with styled skeleton elements.
 */
export function NewUserDefaultsSkeleton() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="new-user-defaults-skeleton"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <h3 className="text-lg font-medium text-black text-left">
                New User Defaults
              </h3>
              <p className="text-sm text-black text-left">
                Configure default settings for newly discovered Plex users
              </p>
            </div>
            <Skeleton className="h-7 w-24 ml-2 mr-2" />
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-0">
          <div className="p-6 border-t border-border">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-5 w-40" />
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-full max-w-md" />
                      <Skeleton className="h-4 w-full max-w-lg" />
                    </div>
                    <Skeleton className="h-6 w-11 ml-4" />
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
