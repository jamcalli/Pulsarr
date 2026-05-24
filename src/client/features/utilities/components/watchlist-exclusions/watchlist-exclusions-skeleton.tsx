import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'

export function WatchlistExclusionsSkeleton() {
  return (
    <div>
      <UtilitySectionHeader
        title="Watchlist Exclusions"
        description="Manage items excluded from watchlist sync to prevent re-request loops"
        showStatus={false}
      />

      <div className="w-full">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2 flex-1">
            <Skeleton className="h-10 w-full max-w-sm" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-20" />
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <Skeleton className="h-4 w-32 mb-2" />

        <TableSkeleton
          rows={10}
          columns={[
            { type: 'text', width: 'w-full max-w-[300px]' },
            { type: 'text', width: 'w-24' },
            { type: 'badge', className: 'w-[100px]' },
            { type: 'badge', className: 'w-[100px]' },
            { type: 'text', width: 'w-20', hideOnMobile: true },
            { type: 'button', width: 'w-24' },
          ]}
          showHeader={true}
        />
      </div>
    </div>
  )
}
