import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { MediaOrientation } from '@/features/dashboard/components/dashboard-media-carousel'
import { MediaRowItem } from '@/features/dashboard/components/media-row-item'

interface MediaCardSkeletonProps {
  orientation?: MediaOrientation
}

export function MediaCardSkeleton({
  orientation = 'card',
}: MediaCardSkeletonProps) {
  if (orientation === 'row') {
    return (
      <MediaRowItem
        poster={
          <div className="w-10 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
            <AspectRatio ratio={2 / 3}>
              <Skeleton className="h-full w-full" />
            </AspectRatio>
          </div>
        }
        title={<Skeleton className="h-4 w-3/4" />}
        meta={<Skeleton className="h-3 w-24" />}
        badge={<Skeleton className="h-6 w-20" />}
      />
    )
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-2.5">
        <AspectRatio
          ratio={2 / 3}
          className="overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800"
        >
          <Skeleton className="h-full w-full" />
        </AspectRatio>
        <div className="mt-2">
          <Skeleton className="h-4 w-3/4 mb-2" />
        </div>
      </CardContent>
    </Card>
  )
}

export default MediaCardSkeleton
