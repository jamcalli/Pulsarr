import { Skeleton } from '@/components/ui/skeleton'

/**
 * Renders a static skeleton UI placeholder for the public content notifications form during loading states.
 *
 * The skeleton layout visually mimics the structure of the notifications form, including header, actions, configuration fields, buttons, and informational text, providing users with a preview of the form's organization while data is being fetched.
 */
export function PublicContentNotificationsSkeleton() {
  return (
    <div className="border-2 border-border rounded-base overflow-hidden">
      <div className="px-6 py-4 bg-main">
        <div className="flex justify-between items-center w-full pr-2">
          <div>
            <h3 className="text-lg font-medium text-black text-left">
              Public Content Notifications
            </h3>
            <p className="text-sm text-black text-left">
              Broadcast ALL content availability to public Discord channels and
              shared Apprise endpoints
            </p>
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
      </div>
      <div className="p-0">
        <div className="p-6 border-t border-border">
          <div className="space-y-6">
            {/* Actions section skeleton */}
            <div>
              <Skeleton className="h-5 w-16 mb-2" />
              <Skeleton className="h-8 w-24" />
            </div>

            <div className="border-t border-border" />

            {/* Configuration form skeleton */}
            <div className="space-y-6">
              <div>
                <Skeleton className="h-5 w-48 mb-4" />
                <div className="space-y-4">
                  <div>
                    <Skeleton className="h-4 w-36 mb-2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-64 mt-1" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-72 mt-1" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-44 mb-2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-80 mt-1" />
                  </div>
                </div>
              </div>

              <div className="border-t border-border" />

              <div>
                <Skeleton className="h-5 w-40 mb-4" />
                <div className="space-y-4">
                  <div>
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-56 mt-1" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-36 mb-2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-64 mt-1" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3 w-60 mt-1" />
                  </div>
                </div>
              </div>

              {/* Action buttons skeleton */}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-28" />
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Information section skeleton */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-3/4 mb-3" />

              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
