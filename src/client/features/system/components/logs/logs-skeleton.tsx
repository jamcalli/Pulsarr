import { useRef } from 'react'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { FilterToolbarSkeleton } from '@/components/filter-toolbar'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import {
  FieldRowSkeleton,
  SettingsSectionSkeleton,
} from '@/components/settings/settings-page-skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LogTableSkeleton } from '@/features/system/components/logs/log-table-skeleton'
import { useStreamHeight } from '@/features/system/hooks/logs/useStreamHeight'
import {
  LOG_FILTER_WIDTHS,
  STREAM_HEIGHT,
} from '@/features/system/lib/logs/log-layout'
import { useIsMobile } from '@/hooks/useIsMobile'

const BUTTON_WIDTHS = ['w-15', 'w-14', 'w-15', 'w-13'] as const

function LogStreamCardSkeleton() {
  const compact = useIsMobile()
  const card = useRef<HTMLDivElement>(null)
  useStreamHeight(card)

  return (
    <Card ref={card}>
      <CardHeaderSkeleton badge buttons={BUTTON_WIDTHS} />
      <CardContent className="gap-4">
        <FilterToolbarSkeleton widths={LOG_FILTER_WIDTHS} />
        <LogTableSkeleton compact={compact} className={STREAM_HEIGHT} />
      </CardContent>
    </Card>
  )
}

export function LogsSkeleton() {
  return (
    <Page wide busy>
      <PageHeaderSkeleton
        description={false}
        action={<Skeleton className="h-6 w-20" />}
      />
      <LogStreamCardSkeleton />
      <SettingsSectionSkeleton description={false}>
        <FieldRowSkeleton control="input" description={false} />
        <FieldRowSkeleton control="input" />
      </SettingsSectionSkeleton>
    </Page>
  )
}
