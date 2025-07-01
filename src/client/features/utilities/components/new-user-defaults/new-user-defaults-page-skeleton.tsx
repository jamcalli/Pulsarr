import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

/**
 * Displays a skeleton loader for the New User Defaults page, providing a visual placeholder that mimics the page's structure during loading.
 *
 * Use this component to indicate loading states while the actual content for configuring default settings for new Plex users is being prepared.
 */
export function NewUserDefaultsPageSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      {/* Header without badge */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">
          New User Defaults
        </h2>
        <p className="text-sm text-foreground mt-1">
          Configure default settings for newly discovered Plex users
        </p>
      </div>

      <div className="space-y-6">
        {/* Current Status section */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">Current Status</h3>
          <p className="text-sm text-foreground mb-3">
            <Skeleton className="h-4 w-3/4" />
          </p>

          {/* Sync Configuration Status */}
          <div className="mb-3">
            <h4 className="font-medium text-sm text-foreground">
              Sync Configuration
            </h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <Skeleton className="h-4 w-2/3" />
              </li>
            </ul>
          </div>

          {/* Approval Configuration Status */}
          <div className="mb-3">
            <h4 className="font-medium text-sm text-foreground">
              Approval Configuration
            </h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <Skeleton className="h-4 w-3/4" />
              </li>
            </ul>
          </div>

          {/* Movie Quota Status */}
          <div className="mb-3">
            <h4 className="font-medium text-sm text-foreground">
              Movie Quotas
            </h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <Skeleton className="h-4 w-4/5" />
              </li>
            </ul>
          </div>

          {/* Show Quota Status */}
          <div>
            <h4 className="font-medium text-sm text-foreground">Show Quotas</h4>
            <ul className="mt-1 space-y-1">
              <li className="text-sm">
                <Skeleton className="h-4 w-4/5" />
              </li>
            </ul>
          </div>
        </div>

        <Separator />

        {/* Form skeleton */}
        <div className="space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
          </div>

          <Separator />

          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
          </div>

          <Separator />

          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
