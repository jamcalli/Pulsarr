import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a skeleton placeholder for the New User Defaults page to indicate loading while configuration data is being fetched.
 *
 * This component visually represents the structure of the page, including current status sections and form fields, using skeleton elements to improve perceived performance during data loading.
 */
export function NewUserDefaultsPageSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="New User Defaults"
        description="Configure default settings for newly discovered Plex users"
        showStatus={false}
      />

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

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  )
}
