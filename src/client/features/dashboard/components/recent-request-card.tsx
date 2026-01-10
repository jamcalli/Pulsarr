import type { RecentRequestItem } from '@root/schemas/dashboard/recent-requests.schema'
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
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePosterUrl } from '@/features/dashboard/hooks/usePosterUrl'
import { cn } from '@/lib/utils'

interface RecentRequestCardProps {
  item: RecentRequestItem
  className?: string
}

const STATUS_CONFIG = {
  pending_approval: {
    label: 'Awaiting Approval',
    variant: 'default' as const,
    className: 'bg-status-pending text-black hover:bg-status-pending',
  },
  pending: {
    label: 'Pending',
    variant: 'default' as const,
    className: 'bg-status-requested text-black hover:bg-status-requested',
  },
  requested: {
    label: 'Requested',
    variant: 'default' as const,
    className: 'bg-status-requested text-black hover:bg-status-requested',
  },
  available: {
    label: 'Available',
    variant: 'default' as const,
    className: 'bg-status-available text-black hover:bg-status-available',
  },
}

const INSTANCE_STATUS_ICONS: Record<string, string> = {
  available: '\u2713',
  requested: '\u2022',
  pending: '\u2022',
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
export function RecentRequestCard({ item, className }: RecentRequestCardProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const hasGuids = Boolean(item.guids?.length)
  const hasInstances = item.allInstances.length > 0
  const hasMultipleInstances = item.allInstances.length > 1
  // Show popover for multiple instances OR single instance when available
  const showInstancePopover =
    hasMultipleInstances || (hasInstances && item.status === 'available')
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
        'absolute top-0 right-0 rounded-bl-md rounded-br-none rounded-tr-md rounded-tl-none',
        statusConfig.className,
        showInstancePopover && 'cursor-pointer',
      )}
    >
      {statusConfig.label}
    </Badge>
  )

  return (
    <>
      <TooltipProvider>
        <Card className={cn('shadow-none', className)}>
          <CardContent className="p-2.5">
            <div className="relative w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
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

              {/* Status badge with optional instance popover */}
              {showInstancePopover ? (
                <Popover>
                  <PopoverTrigger asChild>{StatusBadgeContent}</PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="end"
                    className="w-auto min-w-40 p-2 bg-secondary-background"
                  >
                    <p className="text-xs font-medium mb-1">Available on:</p>
                    <ul className="text-xs space-y-0.5">
                      {item.allInstances.map((instance) => (
                        <li
                          key={`${instance.instanceType}-${instance.id}`}
                          className="flex items-center gap-1"
                        >
                          <span>
                            {INSTANCE_STATUS_ICONS[instance.status] || '\u2022'}
                          </span>
                          <span>{instance.name}</span>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              ) : (
                StatusBadgeContent
              )}

              {/* Content type indicator */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="neutralnoShadow"
                    size="sm"
                    className="absolute top-0 left-0 h-6 w-6 p-0 rounded-tl-md rounded-tr-none rounded-br-md rounded-bl-none"
                    aria-label={
                      item.contentType === 'movie' ? 'Movie' : 'TV Show'
                    }
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

              {/* Eye button for detail modal */}
              {hasGuids && (
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
                      <span className="sr-only">View detailed information</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View details</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Title */}
            <h3 className="mt-2 line-clamp-1 text-sm font-medium leading-tight">
              {item.title}
            </h3>

            {/* User and time */}
            <p className="text-xs text-muted-foreground truncate">
              @{item.userName} · {formatTimeAgo(item.createdAt)}
            </p>
          </CardContent>
        </Card>
      </TooltipProvider>

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
