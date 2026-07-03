import type {
  InstanceStatus,
  RecentRequestItem,
  RecentRequestStatus,
} from '@root/schemas/dashboard/recent-requests.schema'
import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { Eye, Monitor, Tv } from 'lucide-react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { MediaOrientation } from '@/features/dashboard/components/dashboard-media-carousel'
import { MediaRowItem } from '@/features/dashboard/components/media-row-item'
import { usePosterUrl } from '@/features/dashboard/hooks/usePosterUrl'
import { cn } from '@/lib/utils'

interface RecentRequestCardProps {
  item: RecentRequestItem
  className?: string
  orientation?: MediaOrientation
}

const STATUS_CONFIG: Record<
  RecentRequestStatus,
  { label: string; variant: 'default'; className: string }
> = {
  pending_approval: {
    label: 'Awaiting Approval',
    variant: 'default',
    className: 'bg-status-pending text-black hover:bg-status-pending',
  },
  pending: {
    label: 'Pending',
    variant: 'default',
    className: 'bg-status-requested text-black hover:bg-status-requested',
  },
  requested: {
    label: 'Requested',
    variant: 'default',
    className: 'bg-status-requested text-black hover:bg-status-requested',
  },
  available: {
    label: 'Available',
    variant: 'default',
    className: 'bg-status-available text-black hover:bg-status-available',
  },
}

const INSTANCE_STATUS_CONFIG: Record<
  InstanceStatus,
  { icon: string; label: string }
> = {
  available: { icon: '\u2713', label: 'Available' },
  requested: { icon: '\u25CF', label: 'Requested' },
  pending: { icon: '\u25CB', label: 'Pending' },
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * Card component for displaying a recent request item.
 * Shows poster placeholder, status badge, title, user, and time.
 * Supports multi-instance popover when item exists on multiple instances.
 */
export function RecentRequestCard({
  item,
  className,
  orientation = 'card',
}: RecentRequestCardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const isRow = orientation === 'row'

  const hasGuids = Boolean(item.guids?.length)
  const hasInstances = item.allInstances.length > 0
  // Show popover whenever instances exist (junction entries)
  // Only pending_approval has no junction (hasn't routed yet)
  const showInstancePopover = hasInstances
  const statusConfig = STATUS_CONFIG[item.status]

  // Use unified poster hook - fast path if thumb exists, fallback to TMDB fetch
  const { posterUrl, isLoading: isPosterLoading } = usePosterUrl({
    thumb: item.thumb,
    guids: item.guids,
    contentType: item.contentType,
    context: 'card',
    enabled: hasGuids,
  })

  // Convert to ContentStat for the detail modal
  const contentStat: ContentStat = {
    title: item.title,
    count: 0,
    thumb: item.thumb,
    guids: item.guids,
    content_type: item.contentType,
    users: [item.userName],
  }

  const StatusBadgeContent = (
    <Badge
      variant={statusConfig.variant}
      className={cn(
        isRow
          ? 'shrink-0'
          : 'absolute top-0 right-0 rounded-bl-md rounded-br-none rounded-tr-md rounded-tl-none',
        statusConfig.className,
        showInstancePopover && 'cursor-pointer pointer-events-auto',
      )}
    >
      {statusConfig.label}
    </Badge>
  )

  const StatusBadge = showInstancePopover ? (
    // Modal in row mode so dismiss taps don't hit the row's overlay button
    <Popover modal={isRow}>
      <PopoverTrigger asChild>{StatusBadgeContent}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-auto min-w-40 p-2 bg-secondary-background"
      >
        <p className="text-xs font-medium mb-1">Status:</p>
        <ul className="text-xs space-y-0.5">
          {item.allInstances.map((instance) => {
            const instanceStatusConfig = INSTANCE_STATUS_CONFIG[instance.status]
            return (
              <li
                key={`${instance.instanceType}-${instance.id}`}
                className="flex items-center gap-1"
              >
                <span>{instanceStatusConfig.icon}</span>
                <span>
                  {instance.name} ({instanceStatusConfig.label})
                </span>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  ) : (
    StatusBadgeContent
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
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isPosterLoading ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {item.contentType === 'movie' ? 'Movie' : 'Show'}
              </span>
            )}
          </div>
        )}
      </AspectRatio>

      {!isRow && StatusBadge}

      {!isRow && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="neutralnoShadow"
              size="sm"
              className="absolute top-0 left-0 h-6 w-6 p-0 rounded-tl-md rounded-tr-none rounded-br-md rounded-bl-none"
              aria-label={item.contentType === 'movie' ? 'Movie' : 'TV Show'}
            >
              {item.contentType === 'movie' ? (
                <Monitor className="h-3 w-3" />
              ) : (
                <Tv className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {item.contentType === 'movie' ? 'Movie' : 'TV Show'}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Row mode opens the modal by tapping the whole item, no overlay button needed */}
      {!isRow && hasGuids && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="neutralnoShadow"
              size="sm"
              className="absolute bottom-0 right-0 h-6 w-6 p-0 rounded-tl-md rounded-tr-none rounded-br-md rounded-bl-none cursor-pointer"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setModalOpen(true)
              }}
              aria-label="View detailed information"
            >
              <Eye className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View details</TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  const titleText = (
    <h3
      className={cn(
        'text-sm font-medium leading-tight',
        isRow ? 'line-clamp-2' : 'line-clamp-1',
      )}
    >
      {item.title}
      <span className="sr-only">
        {' '}
        ({item.contentType === 'movie' ? 'movie' : 'show'})
      </span>
    </h3>
  )

  const metaText = (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      {isRow &&
        (item.contentType === 'movie' ? (
          <Monitor className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <Tv className="h-3 w-3 shrink-0" aria-hidden="true" />
        ))}
      <span className="truncate">
        @{item.userName} · {formatTimeAgo(item.createdAt)}
      </span>
    </p>
  )

  return (
    <>
      {isRow ? (
        <MediaRowItem
          poster={posterVisual}
          title={titleText}
          meta={metaText}
          badge={StatusBadge}
          onSelect={hasGuids ? () => setModalOpen(true) : undefined}
          selectLabel={`View details for ${item.title} (${item.contentType === 'movie' ? 'movie' : 'show'})`}
          className={className}
        />
      ) : (
        <Card className={cn('shadow-none', className)}>
          <CardContent className="p-2.5">
            {posterVisual}
            <div className="mt-2">
              {titleText}
              {metaText}
            </div>
          </CardContent>
        </Card>
      )}

      {hasGuids && (
        <ContentDetailModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          contentStat={contentStat}
        />
      )}
    </>
  )
}
