import type { ReactNode } from 'react'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton'
import { FilterToolbarSkeleton } from '@/components/filter-toolbar'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  SHOWS_COLUMN_CLASSES,
  SHOWS_COLUMNS,
} from '@/features/library/components/session-monitoring/rolling-shows-columns'
import { SHOWS_FILTER_WIDTHS } from '@/features/library/lib/session-monitoring/shows-state'

const TITLE_WIDTHS = ['w-36', 'w-28', 'w-40', 'w-32', 'w-36', 'w-24'] as const

function cellSkeleton(id: string, titleWidth: string): ReactNode {
  switch (id) {
    case 'show':
      return (
        <div className="flex flex-col gap-1">
          <Skeleton className={`h-4 ${titleWidth}`} />
          <Skeleton className="h-4 w-20" />
        </div>
      )
    case 'mode':
      return <Skeleton className="h-4 w-28" />
    case 'viewers':
      return <Skeleton className="h-6 w-24" />
    default:
      return <Skeleton className="h-4 w-20" />
  }
}

const MANAGE_BUTTON_WIDTHS = ['w-36'] as const

function RollingShowsCardSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton badge description buttons={MANAGE_BUTTON_WIDTHS} />
      <CardContent className="gap-4">
        <FilterToolbarSkeleton widths={SHOWS_FILTER_WIDTHS} />
        <DataTableSkeleton
          columns={SHOWS_COLUMNS}
          columnClasses={SHOWS_COLUMN_CLASSES}
          rows={TITLE_WIDTHS}
          cell={cellSkeleton}
          selectable={false}
          expandable
          variant="flat"
        />
      </CardContent>
    </Card>
  )
}

export function SessionMonitoringSkeleton() {
  return (
    <Page wide busy>
      <PageHeaderSkeleton />
      <SettingsSectionSkeleton rows={['text', 'field']} description={false} />
      <RollingShowsCardSkeleton />
      <SettingsSectionSkeleton rows={['switch', 'input', 'input', 'input']} />
      <SettingsSectionSkeleton rows={['switch', 'input', 'input', 'switch']} />
    </Page>
  )
}
