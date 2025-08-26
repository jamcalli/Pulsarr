import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { Eye } from 'lucide-react'
import { useState } from 'react'
import { ContentDetailModal } from '@/components/content-detail-modal'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MediaCardProps {
  item: ContentStat
  className?: string
  priority?: boolean
}

/**
 * Renders a media item as a card with poster (or a "No image" placeholder), title, and watchlist badge.
 *
 * If the item includes GUIDs, an info button is shown to open a detail modal. The badge displays the item's
 * watchlist count and pluralizes "watchlist(s)". The title is truncated visually and exposed via the title attribute.
 *
 * @param item - The media item to render (ContentStat). Used for thumb, title, count, and GUIDs for the detail modal.
 * @param className - Optional additional CSS class names to apply to the Card container.
 * @param priority - When true, forces eager image loading and high fetch priority; defaults to false (lazy/auto).
 */
export function MediaCard({
  item,
  className,
  priority = false,
}: MediaCardProps) {
  const [modalOpen, setModalOpen] = useState(false)

  // Only show info button if we have GUIDs available for TMDB lookup
  const hasGuids = Boolean(item.guids?.length)

  return (
    <>
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
            <Badge
              variant="neutral"
              className="absolute top-0 right-0 rounded-bl-md rounded-br-none rounded-tr-md rounded-tl-none"
            >
              {item.count} {item.count === 1 ? 'watchlist' : 'watchlists'}
            </Badge>
            {hasGuids && (
              <Button
                variant="neutralnoShadow"
                size="sm"
                className="absolute bottom-0 right-0 h-6 w-6 p-0 rounded-tl-md rounded-tr-none rounded-br-md rounded-bl-none"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setModalOpen(true)
                }}
                title="View detailed information"
                aria-label="View detailed information"
              >
                <Eye className="h-3 w-3" />
                <span className="sr-only">View detailed information</span>
              </Button>
            )}
          </div>
          <h3
            className="mt-2 line-clamp-2 text-sm font-medium leading-tight"
            title={item.title}
          >
            {item.title}
          </h3>
        </CardContent>
      </Card>

      {hasGuids && (
        <ContentDetailModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          contentStat={item}
        />
      )}
    </>
  )
}
