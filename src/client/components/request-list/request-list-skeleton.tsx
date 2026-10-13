import { PosterRowSkeleton } from '@/components/poster-row'
import { ItemRowsSkeleton } from '@/components/request-list/item-rows-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import type { MediaView } from '@/lib/request-list-prefs'

export function RequestListSkeleton({
  view,
  limit,
}: {
  view: MediaView
  limit: number
}) {
  if (view === 'carousel') return <PosterRowSkeleton />
  return (
    <ItemRowsSkeleton
      count={limit}
      action={<Skeleton className="h-6 w-20" />}
    />
  )
}
