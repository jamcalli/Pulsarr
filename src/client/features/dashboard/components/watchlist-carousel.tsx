import { useState, useMemo, useCallback, useEffect } from 'react'
import { MediaCard } from '@/features/dashboard/components/media-card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import MediaCardSkeleton from '@/features/dashboard/components/media-card-skeleton'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel'
import { cn } from '@/lib/utils'
import { useSettings } from '@/components/settings-provider'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { ContentStat } from '@root/schemas/stats/stats.schema'

interface WatchlistCarouselProps {
  title: string
  items: ContentStat[]
  className?: string
  loading?: boolean
  error?: string | null
}

/**
 * Renders a titled card containing a horizontally scrollable carousel of media items, with navigation controls, loading skeletons, and error handling.
 *
 * Displays media items sorted by descending count and then alphabetically by title. Shows skeleton placeholders during loading, an error message if provided, or a "No data available" message when appropriate. Navigation buttons allow scrolling through the carousel when possible.
 *
 * @param title - The title displayed above the carousel.
 * @param items - The list of media items to display in the carousel.
 * @param className - Optional additional CSS classes for the root card.
 * @param loading - Whether to show loading placeholders.
 * @param error - Optional error message to display instead of the carousel.
 * @returns The rendered carousel component.
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
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)
  const { fullscreenEnabled } = useSettings()

  // Custom breakpoints for poster visibility
  const isXXL = useMediaQuery('(min-width: 2450px)')
  const isXL = useMediaQuery('(min-width: 1900px)')
  const isLG = useMediaQuery('(min-width: 1600px)')
  const isMD2 = useMediaQuery('(min-width: 1200px)')
  const isMD = useMediaQuery('(min-width: 768px)')
  // Check if cards are stacked (single column) vs side-by-side
  const isStacked = useMediaQuery('(max-width: 1279px)') // Below xl breakpoint
  // Check for smaller stacked screens where 3 posters is too many
  const isSmallStacked = useMediaQuery('(max-width: 1100px)')

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
    }
  }, [api, onSelect])

  useEffect(() => {
    if (loading) {
      setMinLoadingComplete(false)
      const timer = setTimeout(() => {
        setMinLoadingComplete(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [loading])

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

  // Dynamic class based on fullscreen mode and custom breakpoints
  const carouselItemClass = useMemo(() => {
    if (fullscreenEnabled) {
      // Fullscreen: Scale based on actual screen size and layout (stacked vs side-by-side)
      if (isXXL) return 'pl-2 md:pl-4 basis-1/5 p-1' // 5 posters on huge screens (2450px+)
      if (isXL) return 'pl-2 md:pl-4 basis-1/4 p-1' // 4 posters on very large screens (1900px+)
      if (isLG) return 'pl-2 md:pl-4 basis-1/3 p-1' // 3 posters on large screens (1600px+)
      if (isMD2) {
        // At this breakpoint, check if cards are stacked
        if (isStacked) {
          return 'pl-2 md:pl-4 basis-1/3 p-1' // 3 posters when stacked (1200px-1279px)
        }
        return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 posters when side-by-side (1280px+)
      }
      if (isMD) return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 posters on medium screens (768px+)
      return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 posters on small screens
    }
    // Windowed: Adjust based on whether cards are stacked or side-by-side
    if (isStacked) {
      if (isSmallStacked) {
        // Small stacked screens: 2 posters for better readability
        return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 posters on smaller stacked screens (≤1100px)
      }
      // Large stacked screens: 3 posters to use available width
      return 'pl-2 md:pl-4 basis-1/3 md:basis-1/3 lg:basis-1/3 p-1' // 3 posters when stacked (1101px-1279px)
    }
    // Side-by-side (2 columns): Limited width, show 2 posters
    return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 posters when side-by-side
  }, [
    fullscreenEnabled,
    isXXL,
    isXL,
    isLG,
    isMD2,
    isMD,
    isStacked,
    isSmallStacked,
  ])

  // Inline style to ensure proper sizing when stacked in windowed mode
  const carouselItemStyle = useMemo(() => {
    if (!fullscreenEnabled && isStacked && !isSmallStacked) {
      // Force 3 posters when stacked in windowed mode (only for larger stacked screens)
      return { flexBasis: 'calc(33.333% - 0.5rem)' }
    }
    return {}
  }, [fullscreenEnabled, isStacked, isSmallStacked])

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
            <span className="text-foreground text-muted-foreground">
              No data available
            </span>
          </div>
        ) : (
          <Carousel setApi={setApi} className="w-full">
            <CarouselContent className="-ml-2 md:-ml-4">
              {loading && (!minLoadingComplete || sortedItems.length === 0)
                ? // Show 10 skeleton items with static keys
                  [
                    'skeleton-1',
                    'skeleton-2',
                    'skeleton-3',
                    'skeleton-4',
                    'skeleton-5',
                    'skeleton-6',
                    'skeleton-7',
                    'skeleton-8',
                    'skeleton-9',
                    'skeleton-10',
                  ].map((skeletonId) => (
                    <CarouselItem
                      key={`${title}-${skeletonId}`}
                      className={carouselItemClass}
                      style={carouselItemStyle}
                    >
                      <div className="p-1">
                        <MediaCardSkeleton />
                      </div>
                    </CarouselItem>
                  ))
                : // Show actual items when loaded
                  sortedItems.map((item, index) => (
                    <CarouselItem
                      key={`item-${typeof item.title === 'string' ? item.title : ''}-${item.count}`}
                      className={carouselItemClass}
                      style={carouselItemStyle}
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
