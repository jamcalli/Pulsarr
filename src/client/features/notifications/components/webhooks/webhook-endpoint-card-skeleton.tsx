import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton placeholder for a webhook endpoint card during loading.
 *
 * Matches the structure of WebhookEndpointCard with proper neobrutalism styling.
 */
export function WebhookEndpointCardSkeleton() {
  return (
    <div className="p-4 border-2 border-border rounded-md bg-card">
      {/* Header with name and status */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" /> {/* Name */}
          <Skeleton className="h-7 w-16" /> {/* Status badge */}
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10" /> {/* Edit button */}
          <Skeleton className="h-10 w-10" /> {/* Delete button */}
        </div>
      </div>

      {/* URL display with test button */}
      <div className="mb-3">
        <span className="text-xs text-foreground mb-1 block">URL</span>
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" /> {/* URL input */}
          <Skeleton className="h-10 w-10" /> {/* Test button */}
        </div>
      </div>

      {/* Event types */}
      <div>
        <span className="text-xs text-foreground mb-1 block">Events</span>
        <div className="flex flex-wrap gap-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </div>
  )
}
