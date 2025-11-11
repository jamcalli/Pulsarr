import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useMediaQuery } from '@/hooks/use-media-query'

/**
 * Displays a responsive skeleton UI for the Plex integration interface while content is loading.
 *
 * Shows placeholder elements for the token input, action buttons, watchlist statistics, and RSS feeds, adapting the layout for mobile and desktop screens.
 */
export function PlexConnectionSkeleton() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Plex Integration</h2>
      </div>
      <div className="grid gap-4 mt-4">
        {/* First row (Token input and buttons) */}
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
          <div className="flex-1">
            <div className="flex items-end space-x-2">
              <div className="grow space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="flex space-x-2 shrink-0">
                <Skeleton className="h-10 w-10" />
              </div>
            </div>
          </div>

          <div
            className={`flex items-end gap-2 shrink-0 ${isMobile ? 'w-full mt-2' : ''}`}
          >
            <Skeleton
              className={`h-10 w-32 flex-1 ${isMobile ? 'flex-1' : ''}`}
            />
            <Skeleton
              className={`h-10 w-32 flex-1 ${isMobile ? 'flex-1' : ''}`}
            />
          </div>
        </div>

        {/* Watchlist stats section */}
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>

          <div className={`flex-1 space-y-2 ${isMobile ? 'mt-2' : ''}`}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        {/* RSS Feeds section */}
        <div className="space-y-4">
          <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-4`}>
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className={`flex-1 space-y-2 ${isMobile ? 'mt-2' : ''}`}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>

        {/* Separator */}
        <Separator className="my-6" />

        {/* Content Availability Check section */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-56" />
          <div
            className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}
          >
            {/* Toggle */}
            <div className="flex items-center space-x-2">
              <Skeleton className="h-6 w-11 rounded-full" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>

            {/* Server Connection */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </div>
              <div className="flex space-x-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-32" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlexConnectionSkeleton
