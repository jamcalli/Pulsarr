import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'

export const AccordionRouteCardSkeleton = () => {
  return (
    <Accordion type="single" collapsible className="w-full" defaultValue="">
      <AccordionItem
        value="route"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full pr-2">
            <div>
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </AccordionTrigger>
      </AccordionItem>
    </Accordion>
  )
}

export default AccordionRouteCardSkeleton
