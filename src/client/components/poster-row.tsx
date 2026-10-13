import { cn } from 'cn'
import { Children, type ReactNode } from 'react'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Skeleton } from '@/components/ui/skeleton'

const NAV = 'ml-auto hidden gap-1 md:flex'

function headerRow(heading: ReactNode) {
  return cn(
    'items-center justify-between gap-2',
    heading ? 'flex' : 'hidden md:flex',
  )
}

interface PosterRowProps {
  heading?: ReactNode
  children: ReactNode
}

export function PosterRow({ heading, children }: PosterRowProps) {
  return (
    <Carousel
      opts={{ align: 'start', dragFree: true }}
      className="flex flex-col gap-2"
    >
      <div className={headerRow(heading)}>
        {heading}
        <div className={NAV}>
          <CarouselPrevious className="static" aria-label="Previous" />
          <CarouselNext className="static" aria-label="Next" />
        </div>
      </div>
      <CarouselContent className="pb-2">
        {Children.map(children, (child) => (
          <CarouselItem className="basis-40">{child}</CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}

export function PosterRowSkeleton({ heading }: { heading?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={headerRow(heading)}>
        {heading}
        <div className={NAV}>
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden pb-2">
        {['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => (
          <div key={key} className="flex w-36 shrink-0 flex-col gap-2">
            <PosterFrameSkeleton />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
