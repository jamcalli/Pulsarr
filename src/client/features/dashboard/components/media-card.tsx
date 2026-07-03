import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { Eye } from 'lucide-react'
import { useState } from 'react'
import { ContentDetailModal } from '@/components/content-detail-modal'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { MediaOrientation } from '@/features/dashboard/components/dashboard-media-carousel'
import { MediaRowItem } from '@/features/dashboard/components/media-row-item'
import { usePosterUrl } from '@/features/dashboard/hooks/usePosterUrl'
import { cn } from '@/lib/utils'

interface MediaCardProps {
  item: ContentStat
  className?: string
  priority?: boolean
  orientation?: MediaOrientation
}

/**
 * Poster card (default) or list row; row mode opens the detail modal by
 * tapping the whole item.
 */
export function MediaCard({
  item,
  className,
  priority = false,
  orientation = 'card',
}: MediaCardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const isRow = orientation === 'row'

  // Only show info button if we have GUIDs available for TMDB lookup
  const hasGuids = Boolean(item.guids?.length)
  const hasUsers = Boolean(item.users && item.users.length > 0)

  // Use unified poster hook - fast path if thumb exists, fallback to TMDB fetch
  const contentType = item.content_type === 'show' ? 'show' : ('movie' as const)
  const { posterUrl } = usePosterUrl({
    thumb: item.thumb,
    guids: item.guids ?? [],
    contentType,
    context: 'card',
  })

  const CountBadgeContent = (
    <Badge
      variant="neutral"
      className={cn(
        isRow
          ? 'shrink-0'
          : 'absolute top-0 right-0 rounded-bl-md rounded-br-none rounded-tr-md rounded-tl-none',
        hasUsers && 'cursor-pointer pointer-events-auto',
      )}
    >
      {item.count} {item.count === 1 ? 'watchlist' : 'watchlists'}
    </Badge>
  )

  const CountBadge = hasUsers ? (
    // Modal in row mode so dismiss taps don't hit the row's overlay button
    <Popover modal={isRow}>
      <PopoverTrigger asChild>{CountBadgeContent}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-auto min-w-[120px] p-2 bg-secondary-background"
      >
        <p className="text-xs font-medium mb-1">Watchlisted by:</p>
        <ul className="text-xs space-y-0.5">
          {item.users?.map((user) => (
            <li key={user}>{user}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  ) : (
    CountBadgeContent
  )

  const posterVisual = (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800',
        isRow ? 'w-10 shrink-0' : 'w-full',
      )}
    >
      <AspectRatio ratio={2 / 3}>
        {posterUrl ? (
          <img
            src={posterUrl}
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

      {!isRow && CountBadge}

      {/* Row mode opens the modal by tapping the whole item, no overlay button needed */}
      {!isRow && hasGuids && (
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
  )

  const titleText = (
    <h3
      className="line-clamp-2 text-sm font-medium leading-tight"
      title={item.title}
    >
      {item.title}
    </h3>
  )

  return (
    <>
      {isRow ? (
        <MediaRowItem
          poster={posterVisual}
          title={titleText}
          badge={CountBadge}
          onSelect={hasGuids ? () => setModalOpen(true) : undefined}
          selectLabel={`View details for ${item.title}`}
          className={className}
        />
      ) : (
        <Card className={cn('shadow-none', className)}>
          <CardContent className="p-2.5">
            {posterVisual}
            <div className="mt-2">{titleText}</div>
          </CardContent>
        </Card>
      )}

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
