import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { PosterFrameSkeleton } from '@/components/poster-frame'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { queueColumns } from '@/features/requests/components/approval-queue/approval-queue-columns'
import type { QueueTab } from '@/features/requests/lib/approval-queue/queue-state'
import { useIsMobile } from '@/hooks/useIsMobile'

const TITLE_WIDTHS = ['w-44', 'w-36', 'w-48', 'w-32', 'w-40', 'w-38'] as const
const CELL_WIDTHS: Record<QueueTab, readonly string[]> = {
  pending: ['w-24', 'w-44', 'w-20', 'w-24'],
  history: ['w-24', 'w-40', 'w-24', 'w-20', 'w-24'],
}

function ToolbarSkeleton({ tab }: { tab: QueueTab }) {
  const isMobile = useIsMobile()
  return (
    <>
      {tab === 'history' && <Skeleton className="h-8 w-96 max-w-full" />}
      {isMobile ? (
        <>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-24" />
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 max-w-90 grow basis-60" />
          <Skeleton className="h-10 w-42" />
          <Skeleton className="h-10 w-38" />
          <Skeleton className="h-10 w-42" />
        </div>
      )}
    </>
  )
}

function TableSkeleton({ tab }: { tab: QueueTab }) {
  const headers = queueColumns(tab, true).map((column) =>
    typeof column.header === 'string' ? column.header : '',
  )
  const [requesterWidth, ...cellWidths] = CELL_WIDTHS[tab]

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-px pl-4" />
            {headers.map((header) => (
              <TableHead key={header} className="last:pr-4">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {TITLE_WIDTHS.map((width) => (
            <TableRow key={width} className="hover:bg-transparent">
              <TableCell className="w-px py-2 pl-4">
                <Skeleton className="size-5" />
              </TableCell>
              <TableCell className="py-2">
                <div className="flex items-center gap-3">
                  <PosterFrameSkeleton size="thumb" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className={`h-4 ${width} max-w-full`} />
                    <Skeleton className="h-4 w-14" />
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className={`h-4 ${requesterWidth}`} />
                </div>
              </TableCell>
              {cellWidths.map((cellWidth, index) => (
                <TableCell
                  key={`${cellWidth}-${headers[index + 2]}`}
                  className="py-2 last:pr-4"
                >
                  <Skeleton className={`h-4 ${cellWidth}`} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

export function ApprovalQueueBodySkeleton({ tab }: { tab: QueueTab }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <ToolbarSkeleton tab={tab} />
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
