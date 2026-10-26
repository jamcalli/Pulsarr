import { cn } from 'cn'
import { lazy, type ReactNode, Suspense } from 'react'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import { Skeleton } from '@/components/ui/skeleton'

const PosterRowCarousel = lazy(() => import('@/components/poster-row-carousel'))

export const POSTER_ROW_NAV = 'ml-auto hidden gap-1 md:flex'

export function posterRowHeader(heading: ReactNode) {
  return cn(
    'items-center justify-between gap-2',
    heading ? 'flex' : 'hidden md:flex',
  )
}

export interface PosterRowProps {
  heading?: ReactNode
  children: ReactNode
}

export function PosterRow({ heading, children }: PosterRowProps) {
  return (
    <Suspense fallback={<PosterRowSkeleton heading={heading} />}>
      <PosterRowCarousel heading={heading}>{children}</PosterRowCarousel>
    </Suspense>
  )
}

export function PosterRowSkeleton({ heading }: { heading?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={posterRowHeader(heading)}>
        {heading}
        <div className={POSTER_ROW_NAV}>
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
