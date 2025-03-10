import { Skeleton } from '@/components/ui/skeleton'

export function PlexConnectionSkeleton() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">Plex Integration</h2>
      </div>
      <div className="grid gap-4 mt-4">
        {/* First row (Token input and buttons) */}
        <div className="flex portrait:flex-col gap-4">
          <div className="flex-1">
            <div className="flex items-end space-x-2">
              <div className="flex-grow space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="flex space-x-2 shrink-0">
                <Skeleton className="h-10 w-10" />
              </div>
            </div>
          </div>

          <div className="flex items-end gap-2 shrink-0">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* Watchlist stats section */}
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>

          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        {/* RSS Feeds section */}
        <div className="space-y-4">
          <div className="flex portrait:flex-col gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlexConnectionSkeleton
