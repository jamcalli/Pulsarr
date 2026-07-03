import { ArrowLeft, ArrowRight } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useSettings } from '@/components/settings-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { ScrollArea } from '@/components/ui/scroll-area'
import MediaCardSkeleton from '@/features/dashboard/components/media-card-skeleton'
import { useCarouselResponsive } from '@/features/dashboard/hooks/useCarouselResponsive'
import type { MediaViewMode } from '@/features/dashboard/hooks/useMediaViewMode'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

export type MediaOrientation = 'card' | 'row'

const skeletonIds = (count: number) =>
  Array.from({ length: count }, (_, i) => `skeleton-${i}`)

interface DashboardMediaCarouselProps<T> {
  items: T[]
  renderItem: (
    item: T,
    orientation: MediaOrientation,
    index: number,
  ) => ReactNode
  getKey: (item: T, index: number) => string
  emptyMessage: string
  title?: string
  className?: string
  loading?: boolean
  error?: string | null
  /** Full-width sections show 2x items per row; see useCarouselResponsive. */
  fullWidth?: boolean
  /** Desktop layout preference; mobile always renders the list. */
  view?: MediaViewMode
}

/**
 * Desktop carousel that collapses to a stacked list on mobile or when the
 * caller opts into list view. Callers render their own cards via renderItem.
 */
export function DashboardMediaCarousel<T>({
  items,
  renderItem,
  getKey,
  emptyMessage,
  title,
  className,
  loading = false,
  error = null,
  fullWidth = false,
  view = 'carousel',
}: DashboardMediaCarouselProps<T>) {
  const [api, setApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)
  // 767 complements MediaViewToggle's md: visibility
  const isMobile = useMediaQuery('(max-width: 767px)')
  const { fullscreenEnabled } = useSettings()
  const { carouselItemClass } = useCarouselResponsive({
    fullscreenEnabled,
    fullWidth,
  })

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

  const isList = isMobile || view === 'list'
  const showHeader = Boolean(title) || !isList

  return (
    <Card className={cn('w-full bg-background relative', className)}>
      {showHeader && (
        <CardHeader
          className={cn(
            'pb-3 flex flex-row items-center',
            title ? 'justify-between' : 'justify-end',
          )}
        >
          {title && <CardTitle className="text-foreground">{title}</CardTitle>}
          {!isList && (
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
          )}
        </CardHeader>
      )}
      {/* CardContent's default pt-0 assumes a CardHeader; pt-3 mirrors the header's pb-3 gap when there isn't one */}
      <CardContent className={cn(!showHeader && 'pt-3')}>
        {error ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-destructive">{error}</span>
          </div>
        ) : items.length === 0 && !loading ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-foreground">{emptyMessage}</span>
          </div>
        ) : isList ? (
          // Max height must also be on the Radix viewport or it clips without
          // scrolling; type auto keeps the scrollbar visible on touch
          <ScrollArea
            type="auto"
            className="max-h-[60vh] *:data-radix-scroll-area-viewport:max-h-[60vh]"
          >
            {/* Clearance so the overlay scrollbar stays off the rows' border */}
            <div className="flex flex-col gap-2 pr-4.5">
              {loading
                ? skeletonIds(5).map((skeletonId) => (
                    <MediaCardSkeleton key={skeletonId} orientation="row" />
                  ))
                : items.map((item, index) => (
                    <div key={getKey(item, index)}>
                      {renderItem(item, 'row', index)}
                    </div>
                  ))}
            </div>
          </ScrollArea>
        ) : (
          <Carousel setApi={setApi} className="w-full">
            <CarouselContent className="-ml-2 md:-ml-4">
              {loading
                ? skeletonIds(10).map((skeletonId) => (
                    <CarouselItem
                      key={skeletonId}
                      className={carouselItemClass}
                    >
                      <div className="p-1">
                        <MediaCardSkeleton />
                      </div>
                    </CarouselItem>
                  ))
                : items.map((item, index) => (
                    <CarouselItem
                      key={getKey(item, index)}
                      className={carouselItemClass}
                    >
                      <div className="p-1">
                        {renderItem(item, 'card', index)}
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
