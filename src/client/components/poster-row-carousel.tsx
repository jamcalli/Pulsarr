import { Children } from 'react'
import {
  POSTER_ROW_NAV,
  type PosterRowProps,
  posterRowHeader,
} from '@/components/poster-row'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'

export default function PosterRowCarousel({
  heading,
  children,
}: PosterRowProps) {
  return (
    <Carousel
      opts={{ align: 'start', dragFree: true }}
      className="flex flex-col gap-2"
    >
      <div className={posterRowHeader(heading)}>
        {heading}
        <div className={POSTER_ROW_NAV}>
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
