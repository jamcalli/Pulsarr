import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MediaCardProps {
  item: ContentStat
  className?: string
  priority?: boolean
}

export function MediaCard({
  item,
  className,
  priority = false,
}: MediaCardProps) {
  return (
    <Card className={cn('shadow-none', className)}>
      <CardContent className="p-[10px]">
        <div className="relative w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
          <AspectRatio ratio={2 / 3}>
            {item.thumb ? (
              <img
                src={item.thumb}
                alt={`${item.title} poster`}
                className="h-full w-full object-cover"
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  No image
                </span>
              </div>
            )}
          </AspectRatio>
          <div className="absolute right-2 top-2">
            <Badge variant="neutral">
              {item.count} {item.count === 1 ? 'watchlist' : 'watchlists'}
            </Badge>
          </div>
        </div>
        <h3
          className="mt-2 line-clamp-2 text-sm font-medium leading-tight"
          title={item.title}
        >
          {item.title}
        </h3>
      </CardContent>
    </Card>
  )
}
