import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useCarouselResponsive } from '@/features/dashboard/hooks/useCarouselResponsive'
import {
  getLimitLabel,
  LIMIT_PRESETS,
  STATUS_FILTER_OPTIONS,
  useRecentRequests,
} from '@/features/dashboard/hooks/useRecentRequests'
import { cn } from '@/lib/utils'

/**
 * Recent Requests section for the dashboard.
 * Displays a carousel of recent requests with status filter.
 */
export function RecentRequests() {
  const navigate = useNavigate()
  const { items, isLoading, error, status, setStatus, limit, setLimit } =
    useRecentRequests()

  const [api, setApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)
  const { fullscreenEnabled } = useSettings()
  const { carouselItemClass } = useCarouselResponsive({
    fullscreenEnabled,
    fullWidth: true,
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
        <Button
          variant="neutralnoShadow"
          className="flex items-center gap-2"
          onClick={() => navigate('/approvals')}
        >
          <span>View All</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
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
                  {isLoading
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
