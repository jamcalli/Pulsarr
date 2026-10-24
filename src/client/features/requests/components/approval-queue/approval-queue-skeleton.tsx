import type { ReactNode } from 'react'
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton'
import { FilterToolbarSkeleton } from '@/components/filter-toolbar'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import { StatusFilterSkeleton } from '@/components/status-filter'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatarSkeleton } from '@/components/user-avatar'
import {
  QUEUE_COLUMN_CLASSES,
  queueColumns,
} from '@/features/requests/components/approval-queue/approval-queue-columns'
import {
  QUEUE_FILTER_WIDTHS,
  type QueueTab,
} from '@/features/requests/lib/approval-queue/queue-state'

const TITLE_WIDTHS = ['w-44', 'w-36', 'w-48', 'w-32', 'w-40', 'w-38'] as const
const CELL_WIDTHS: Record<QueueTab, Partial<Record<string, string>>> = {
  pending: {
    requester: 'w-24',
    trigger: 'w-44',
    requested: 'w-20',
    expires: 'w-24',
  },
  history: {
    requester: 'w-24',
    trigger: 'w-40',
    requested: 'w-24',
    status: 'w-20',
    decided: 'w-24',
  },
}

function TableSkeleton({ tab }: { tab: QueueTab }) {
  const widths = CELL_WIDTHS[tab]
  const cell = (id: string, titleWidth: string): ReactNode => {
    if (id === 'title') {
      return (
        <div className="flex items-center gap-3">
          <PosterFrameSkeleton size="thumb" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-4 ${titleWidth} max-w-full`} />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
      )
    }
    if (id === 'requester') {
      return (
        <div className="flex items-center gap-2">
          <UserAvatarSkeleton size="sm" />
          <Skeleton className={`h-4 ${widths.requester}`} />
        </div>
      )
    }
    return <Skeleton className={`h-4 ${widths[id] ?? 'w-20'}`} />
  }

  return (
    <DataTableSkeleton
      columns={queueColumns(tab, true)}
      columnClasses={QUEUE_COLUMN_CLASSES}
      rows={TITLE_WIDTHS}
      cell={cell}
    />
  )
}

export function ApprovalQueueBodySkeleton({ tab }: { tab: QueueTab }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      {tab === 'history' && <StatusFilterSkeleton className="w-96" />}
      <FilterToolbarSkeleton widths={QUEUE_FILTER_WIDTHS} />
      <TableSkeleton tab={tab} />
    </div>
  )
}

export function ApprovalQueueSkeleton() {
  return (
    <Page wide>
      <PageHeaderSkeleton />
      <Skeleton className="h-11 w-56" />
      <ApprovalQueueBodySkeleton tab="pending" />
    </Page>
  )
}
