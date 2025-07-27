import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a static skeleton UI for the API Keys management page while data is loading.
 *
 * Renders placeholder elements for the section header, actions, current status, API key creation form, and a list of existing API keys to visually mimic the final page layout during asynchronous data fetching.
 */
export function ApiKeysSkeleton() {
  return (
    <div className="space-y-6">
      <UtilitySectionHeader
        title="API Keys"
        description="Manage API keys for external access to your Pulsarr instance"
        showStatus={false}
      />

      <div className="mt-6 space-y-6">
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
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
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
                {/* Header with name, status badge, and date */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-40" />
                </div>

                {/* API Key display with actions */}
                <div className="flex items-center gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-10" />
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center">
                  <Skeleton className="h-8 w-16" />
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
