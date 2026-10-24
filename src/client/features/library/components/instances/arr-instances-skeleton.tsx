import { CardFrame } from '@/components/card-frame'
import { FactListSkeleton } from '@/components/fact-list'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

const CARD_NAME_WIDTHS = ['w-32', 'w-40'] as const

export function ArrInstancesSkeleton() {
  return (
    <Page busy>
      <PageHeaderSkeleton action={<Skeleton className="h-10 w-32" />} />
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
              <FactListSkeleton rows={2} />
            </div>
          </CardFrame>
        ))}
      </div>
      <SettingsSectionSkeleton rows={3} />
    </Page>
  )
}
