import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Displays a static skeleton UI for the Public Content Notifications page while data is loading.
 *
 * Mimics the layout of the page with placeholder elements for headers, actions, informational sections, and configuration forms.
 */
export function PublicContentNotificationsPageSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <UtilitySectionHeader
        title="Public Content Notifications"
        description="Broadcast ALL content availability to public Discord channels and shared Apprise endpoints"
      />

      <div className="space-y-6">
        {/* Actions section */}
        <div>
          <h3 className="font-medium text-foreground mb-2">Actions</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        <Separator />

        {/* Information about public content notifications */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
          <h3 className="font-medium text-foreground mb-2">
            Public Content Broadcasting
          </h3>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        <Separator />

        {/* Configuration form placeholder (shows loading state) */}
        <div className="space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-64" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  )
}
