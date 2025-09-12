import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton loader for the log viewer section content
 */
export function LogViewerSkeleton() {
  return (
    <div className="space-y-6">
      {/* Actions section skeleton */}
      <div>
        <Skeleton className="h-6 w-32 mb-2" />
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      {/* Settings section skeleton */}
      <div>
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>

      {/* Status section skeleton */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-4 w-48 mb-1" />
        <Skeleton className="h-4 w-36" />
      </div>

      {/* Log display section skeleton */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-6 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </div>

        <Skeleton className="h-[32rem] w-full" />
      </div>
    </div>
  )
}
