import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteCardFrame } from '@/features/library/components/content-router/route-card-frame'
import { RouteFallbackFrame } from '@/features/library/components/content-router/route-fallback-frame'

const CARD_NAME_WIDTHS = ['w-48', 'w-40', 'w-56'] as const

export function ContentRouterSkeleton() {
  return (
    <Page>
      <div aria-busy="true" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeaderSkeleton />
          <Skeleton className="h-10 w-28" />
        </div>
        <Skeleton className="h-11 w-56" />
        <div className="flex flex-col gap-4">
          {CARD_NAME_WIDTHS.map((width) => (
            <RouteCardFrame key={width}>
              <div className="flex items-start gap-3.5">
                <Skeleton className="h-14 w-14 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className={`h-6 ${width} max-w-full`} />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-60 max-w-full" />
                </div>
                <Skeleton className="h-6 w-11 shrink-0" />
                <Skeleton className="size-9 shrink-0" />
              </div>
            </RouteCardFrame>
          ))}
          <RouteFallbackFrame media={<Skeleton className="size-5" />}>
            <Skeleton className="h-4 w-3/4" />
          </RouteFallbackFrame>
        </div>
      </div>
    </Page>
  )
}
