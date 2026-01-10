import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@/components/settings-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { Select } from '@/components/ui/select'
import MediaCardSkeleton from '@/features/dashboard/components/media-card-skeleton'
import { RecentRequestCard } from '@/features/dashboard/components/recent-request-card'
import {
  getLimitLabel,
  LIMIT_PRESETS,
  STATUS_FILTER_OPTIONS,
  useRecentRequests,
} from '@/features/dashboard/hooks/useRecentRequests'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

/**
 * Recent Requests section for the dashboard.
 * Displays a carousel of recent requests with status filter.
 */
export function RecentRequests() {
  const { items, isLoading, error, status, setStatus, limit, setLimit } =
    useRecentRequests()

  const [api, setApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)
  const { fullscreenEnabled } = useSettings()

  // Custom breakpoints for poster visibility - copied from WatchlistCarousel
  const isXXL = useMediaQuery('(min-width: 2450px)')
  const isXL = useMediaQuery('(min-width: 1900px)')
  const isLG = useMediaQuery('(min-width: 1600px)')
  const isMD2 = useMediaQuery('(min-width: 1200px)')
  const isMD = useMediaQuery('(min-width: 768px)')
  const isStacked = useMediaQuery('(max-width: 1279px)')
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
      api.off('reInit', onSelect)
    }
  }, [api, onSelect])

  useEffect(() => {
    if (isLoading) {
      setMinLoadingComplete(false)
      const timer = setTimeout(() => {
        setMinLoadingComplete(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  // When stacked (viewport < 1280px): both RecentRequests and WatchlistCarousel are full-width
  // When side-by-side (viewport >= 1280px): WatchlistCarousel is half-width, RecentRequests is full-width
  const carouselItemClass = useMemo(() => {
    if (isStacked) {
      // Stacked: match WatchlistCarousel exactly (both full-width)
      if (fullscreenEnabled) {
        if (isMD2) return 'pl-2 md:pl-4 basis-1/3 p-1' // 3 items (1200-1279px)
        if (isMD) return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items (768-1199px)
        return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items (<768px)
      }
      // Windowed stacked
      if (isSmallStacked) return 'pl-2 md:pl-4 basis-1/2 p-1' // 2 items (≤1100px)
      return 'pl-2 md:pl-4 basis-1/3 p-1' // 3 items (1101-1279px)
    }

    // Side-by-side (viewport >= 1280px): double the items since we're full-width
    if (fullscreenEnabled) {
      if (isXXL) return 'pl-2 md:pl-4 basis-[10%] p-1' // 10 items (WatchlistCarousel: 5)
      if (isXL) return 'pl-2 md:pl-4 basis-[12.5%] p-1' // 8 items (WatchlistCarousel: 4)
      if (isLG) return 'pl-2 md:pl-4 basis-1/6 p-1' // 6 items (WatchlistCarousel: 3)
      return 'pl-2 md:pl-4 basis-1/4 p-1' // 4 items (WatchlistCarousel: 2)
    }
    // Windowed side-by-side
    return 'pl-2 md:pl-4 basis-1/4 p-1' // 4 items (WatchlistCarousel: 2)
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

  const filterOptions = useMemo(
    () =>
      STATUS_FILTER_OPTIONS.map((opt) => ({
        label: opt.label,
        value: opt.value,
      })),
    [],
  )

  const limitOptions = useMemo(
    () =>
      LIMIT_PRESETS.map((preset) => ({
        label: getLimitLabel(preset),
        value: preset.toString(),
      })),
    [],
  )

  return (
    <div className="mb-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold text-foreground">Recent Requests</h2>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as typeof status)}
          options={filterOptions}
          disabled={isLoading}
          className="w-40"
        />
        <Select
          value={limit.toString()}
          onValueChange={(value) => setLimit(Number(value) as typeof limit)}
          options={limitOptions}
          disabled={isLoading}
          className="w-27.5"
        />
        <Link to="/approvals">
          <Button variant="neutralnoShadow" className="flex items-center gap-2">
            <span>View All</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1">
        <Card className={cn('w-full bg-background relative')}>
          <CardHeader className="pb-3 flex flex-row items-center justify-end">
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
            ) : items.length === 0 && !isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <span className="text-foreground">No recent requests</span>
              </div>
            ) : (
              <Carousel setApi={setApi} className="w-full">
                <CarouselContent className="-ml-2 md:-ml-4">
                  {isLoading && (!minLoadingComplete || items.length === 0)
                    ? Array.from({ length: 10 }, (_, i) => `skeleton-${i}`).map(
                        (skeletonId) => (
                          <CarouselItem
                            key={skeletonId}
                            className={carouselItemClass}
                          >
                            <div className="p-1">
                              <MediaCardSkeleton />
                            </div>
                          </CarouselItem>
                        ),
                      )
                    : items.map((item) => (
                        <CarouselItem
                          key={`${item.source}-${item.id}`}
                          className={carouselItemClass}
                        >
                          <div className="p-1">
                            <RecentRequestCard item={item} />
                          </div>
                        </CarouselItem>
                      ))}
                </CarouselContent>
              </Carousel>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
