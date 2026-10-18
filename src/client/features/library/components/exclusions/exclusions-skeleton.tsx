import type { ReactNode } from 'react'
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton'
import { FilterToolbarSkeleton } from '@/components/filter-toolbar'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EXCLUSIONS_COLUMN_CLASSES,
  exclusionsColumns,
} from '@/features/library/components/exclusions/exclusions-columns'
import { EXCLUSIONS_FILTER_WIDTHS } from '@/features/library/lib/exclusions/exclusions-state'

const TITLE_WIDTHS = [
  'w-44',
  'w-36',
  'w-48',
  'w-32',
  'w-40',
  'w-38',
  'w-28',
  'w-52',
  'w-30',
  'w-42',
] as const

const SKELETON_COLUMNS = exclusionsColumns(true, () => undefined)

function cellSkeleton(id: string, titleWidth: string): ReactNode {
  switch (id) {
    case 'title':
      return (
        <div className="flex items-center gap-3">
          <PosterFrameSkeleton size="thumb" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-4 ${titleWidth} max-w-full`} />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
      )
    case 'watchlisters':
      return <Skeleton className="h-4 w-6" />
    case 'excluded':
      return <Skeleton className="h-4 w-12" />
    case 'actions':
      return <Skeleton className="size-8" />
    default:
      return <Skeleton className="h-4 w-20" />
  }
}

export function ExclusionsSkeleton() {
  return (
    <Page wide busy>
      <PageHeaderSkeleton />
      <FilterToolbarSkeleton widths={EXCLUSIONS_FILTER_WIDTHS} />
      <DataTableSkeleton
        columns={SKELETON_COLUMNS}
        columnClasses={EXCLUSIONS_COLUMN_CLASSES}
        rows={TITLE_WIDTHS}
        cell={cellSkeleton}
        expandable
        variant="flat"
      />
      <SettingsSectionSkeleton
        rows={['switch', 'input', 'input', 'field']}
        pill
        description={false}
      />
    </Page>
  )
}
