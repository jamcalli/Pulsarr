import { CardFrame } from '@/components/card-frame'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

const CARD_NAME_WIDTHS = ['w-32', 'w-40'] as const

export function ArrInstancesSkeleton() {
  return (
    <Page>
      <div aria-busy="true" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeaderSkeleton />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="flex flex-col gap-4">
          {CARD_NAME_WIDTHS.map((width) => (
            <CardFrame key={width}>
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className={`h-6 ${width} max-w-full`} />
                    <Skeleton className="h-5 w-56 max-w-full" />
                  </div>
                  <Skeleton className="mt-1 size-4 shrink-0" />
                  <Skeleton className="h-6 w-24 shrink-0" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Skeleton className="h-10 w-28" />
                  <Skeleton className="h-10 w-32" />
                </div>
              </div>
            </CardFrame>
          ))}
        </div>
        <SettingsSectionSkeleton rows={3} />
      </div>
    </Page>
  )
}
