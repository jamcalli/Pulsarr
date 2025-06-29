import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

/**
 * Skeleton loader for the New User Defaults page showing placeholders for the page layout.
 */
export function NewUserDefaultsPageSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      {/* Header with title and badge */}
      <div className="mb-6">
        <div className="flex items-center">
          <h2 className="text-2xl font-bold text-foreground">
            New User Defaults
          </h2>
          <div className="ml-2 inline-flex items-center gap-2 h-full">
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>
        <p className="text-sm text-foreground mt-1">
          Configure default settings for newly discovered Plex users
        </p>
      </div>

      <div className="space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-32" />
          </div>
        </div>

        <Separator />

        {/* Information section */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">
            New User Sync Behavior
          </h3>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  )
}
