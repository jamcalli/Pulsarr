import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Renders a skeleton placeholder for the API Keys management page during loading.
 *
 * Displays non-interactive skeleton elements for all major sections of the API Keys page, including actions, current status, API key creation, and existing API keys, to visually indicate the page layout while data is being fetched.
 */
export function ApiKeysSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="API Keys"
        description="Manage API keys for external access to your Pulsarr instance"
        showStatus={false}
      />

      <div className="space-y-6">
        {/* Actions section skeleton */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        <Separator />

        {/* Current Status section skeleton */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">Current Status</h3>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full max-w-64" />
            <Skeleton className="h-4 w-3/4 max-w-48" />
          </div>
        </div>

        <Separator />

        {/* Create API Key Form section skeleton */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-foreground mb-2">
            Create New API Key
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-9 w-40" />
          </div>
        </div>

        <Separator />

        {/* Existing API Keys section skeleton */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-foreground mb-2">
            Existing API Keys
          </h3>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="p-4 border-2 border-border rounded-md bg-card space-y-3"
              >
                {/* Header with name and date */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-40 sm:w-auto" />
                </div>

                {/* API Key display with actions */}
                <div className="flex items-center gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-10" />
                </div>

                {/* Actions */}
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
