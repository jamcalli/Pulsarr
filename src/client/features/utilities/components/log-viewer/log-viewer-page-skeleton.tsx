import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

/**
 * Full page skeleton loader for the log viewer page
 */
export function LogViewerPageSkeleton() {
  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <output aria-live="polite" aria-busy="true">
        <UtilitySectionHeader
          title="Log Viewer"
          description="Real-time application log monitoring with filtering, level control, and export capabilities"
          showStatus={false}
        />

        <div className="mt-6 space-y-6">
          {/* Actions section */}
          <div>
            <h3 className="font-medium text-foreground mb-2">Actions</h3>
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>

          <Separator />

          {/* Controls section */}
          <div>
            <h3 className="font-medium text-foreground mb-4">Log Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-10" />
                  <Skeleton className="h-10 w-10" />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Streaming status */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <h3 className="font-medium text-foreground">Streaming Status</h3>
            </div>
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-4 w-40" />
          </div>

          <Separator />

          {/* Log display */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-foreground">Log Output</h3>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>

            <Skeleton className="h-[32rem] w-full" />
          </div>
        </div>
      </output>
    </div>
  )
}
