import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AspectRatio } from '@/components/ui/aspect-ratio'

export function MediaCardSkeleton() {
  return (
    <Card className="shadow-none">
      <CardContent className="p-[10px]">
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
