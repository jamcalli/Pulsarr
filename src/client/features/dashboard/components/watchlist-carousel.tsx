import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettings } from '@/components/settings-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { MediaCard } from '@/features/dashboard/components/media-card'
import MediaCardSkeleton from '@/features/dashboard/components/media-card-skeleton'
import { useCarouselResponsive } from '@/features/dashboard/hooks/useCarouselResponsive'
import { cn } from '@/lib/utils'

interface WatchlistCarouselProps {
  title: string
  items: ContentStat[]
  className?: string
  loading?: boolean
  error?: string | null
}

/**
 * Renders a responsive card containing a horizontally scrollable carousel of media items with navigation controls, adaptive layout, and comprehensive loading and error handling.
 *
 * Media items are sorted by descending count and then alphabetically by title. The carousel dynamically adjusts the number and size of visible items based on fullscreen mode and viewport breakpoints. If an error message is provided, it is displayed in place of the carousel; if there are no items and not loading, a "No data available" message is shown. Navigation buttons are enabled only when additional scrolling is possible.
 *
 * @param title - The title displayed above the carousel.
 * @param items - The list of media items to display.
 * @param className - Optional additional CSS classes for the root card.
 * @param loading - Whether to show loading placeholders (minimum duration handled by useAppQuery).
 * @param error - Optional error message to display instead of the carousel.
 */
export function WatchlistCarousel({
  title,
  items = [],
  className,
  loading = false,
  error = null,
}: WatchlistCarouselProps) {
  const [api, setApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)
  const { fullscreenEnabled } = useSettings()
  const { carouselItemClass } = useCarouselResponsive({ fullscreenEnabled })

  const scrollPrev = useCallback(() => {
    api?.scrollPrev()
  }, [api])

  const scrollNext = useCallback(() => {
    api?.scrollNext()
  }, [api])

  const onSelect = useCallback(() => {
    if (!api) return

    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [api])

  useEffect(() => {
    if (!api) return
    onSelect()
    api.on('select', onSelect)
    api.on('reInit', onSelect)
    return () => {
      api.off('select', onSelect)
      api.off('reInit', onSelect)
    }
  }, [api, onSelect])

  const sortedItems = useMemo(() => {
    if (!items || !Array.isArray(items) || items.length === 0) return []

    return [...items].sort((a, b) => {
      const countA = typeof a.count === 'number' ? a.count : 0
      const countB = typeof b.count === 'number' ? b.count : 0

      if (countA !== countB) {
        return countB - countA
      }

      const titleA = typeof a.title === 'string' ? a.title : ''
      const titleB = typeof b.title === 'string' ? b.title : ''

      return titleA.localeCompare(titleB)
    })
  }, [items])

  return (
    <Card className={cn('w-full bg-background relative', className)}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-foreground">{title}</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="noShadow"
            size="icon"
            className="h-8 w-8 rounded-base"
            disabled={!canScrollPrev}
            onClick={scrollPrev}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Previous</span>
          </Button>
          <Button
            variant="noShadow"
            size="icon"
            className="h-8 w-8 rounded-base"
            disabled={!canScrollNext}
            onClick={scrollNext}
          >
            <ArrowRight className="h-4 w-4" />
            <span className="sr-only">Next</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-destructive">{error}</span>
          </div>
        ) : sortedItems.length === 0 && !loading ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-foreground">No data available</span>
          </div>
        ) : (
          <Carousel setApi={setApi} className="w-full">
            <CarouselContent className="-ml-2 md:-ml-4">
              {loading
                ? Array.from({ length: 10 }, (_, i) => `skeleton-${i}`).map(
                    (skeletonId) => (
                      <CarouselItem
                        key={`${title}-${skeletonId}`}
                        className={carouselItemClass}
                      >
                        <div className="p-1">
                          <MediaCardSkeleton />
                        </div>
                      </CarouselItem>
                    ),
                  )
                : // Show actual items when loaded
                  sortedItems.map((item, index) => (
                    <CarouselItem
                      key={`item-${typeof item.title === 'string' ? item.title : ''}-${item.count}`}
                      className={carouselItemClass}
                    >
                      <div className="p-1">
                        {/* Set priority=true for the first 3 items that will be visible */}
                        <MediaCard item={item} priority={index < 3} />
                      </div>
                    </CarouselItem>
                  ))}
            </CarouselContent>
          </Carousel>
        )}
      </CardContent>
    </Card>
  )
}
