import { ApprovalReviewCredenza } from '@/components/approval-review/approval-review-credenza'
import { DataTableFooter } from '@/components/data-table/data-table-footer'
import { ErrorAlert } from '@/components/error-alert'
import { Page, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApprovalQueueBar } from '@/features/requests/components/approval-queue/approval-queue-bar'
import { ApprovalQueueEmpty } from '@/features/requests/components/approval-queue/approval-queue-empty'
import {
  ApprovalQueueFilters,
  ApprovalQueuePhoneFilters,
} from '@/features/requests/components/approval-queue/approval-queue-filters'
import { ApprovalQueueBodySkeleton } from '@/features/requests/components/approval-queue/approval-queue-skeleton'
import { ApprovalQueueTable } from '@/features/requests/components/approval-queue/approval-queue-table'
import { BulkConfirm } from '@/features/requests/components/approval-queue/bulk-confirm'
import { HistoryStatusFilter } from '@/features/requests/components/approval-queue/history-status-filter'
import { invalidateApprovalQueue } from '@/features/requests/hooks/approval-queue/useApprovalQueueList'
import {
  type ApprovalQueuePage as QueuePage,
  useApprovalQueuePage,
} from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import {
  QUEUE_PAGE_SIZE,
  QUEUE_TABS,
} from '@/features/requests/lib/approval-queue/queue-state'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatNumber } from '@/lib/format'
import { NAV_PAGES } from '@/lib/navigation'

const SECTION = 'Requests'
const TITLE = NAV_PAGES.approvalQueue.label
const DESCRIPTION = 'Decide on held requests and look back at past decisions.'

function QueueBody({ page }: { page: QueuePage }) {
  const isMobile = useIsMobile()
  const { rows } = page

  if (page.isLoading) return <ApprovalQueueBodySkeleton tab={page.state.tab} />
  if (rows === null) return null

  const empty = rows.length === 0
  const showToolbar = !empty || page.filtered
  const showStatus =
    page.state.tab === 'history' && (showToolbar || page.state.status !== 'all')

  return (
    <div className="flex flex-col gap-5">
      {showStatus && <HistoryStatusFilter page={page} />}
      {showToolbar &&
        (isMobile ? (
          <ApprovalQueuePhoneFilters page={page} />
        ) : (
          <ApprovalQueueFilters page={page} />
        ))}
      {empty ? (
        <ApprovalQueueEmpty page={page} />
      ) : (
        <ApprovalQueueTable page={page} rows={rows} />
      )}
      <DataTableFooter
        page={page.state.page}
        pageSize={QUEUE_PAGE_SIZE}
        total={empty ? 0 : page.total}
        pageHref={page.pageHref}
        onPageChange={page.setPage}
      />
    </div>
  )
}

export default function ApprovalQueuePage() {
  const page = useApprovalQueuePage()
  const pendingCount = page.stats?.pending ?? 0

  if (page.errorMessage) {
    return (
      <Page wide>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <ErrorAlert message={page.errorMessage} />
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={page.retry}
        >
          Retry
        </Button>
      </Page>
    )
  }

  return (
    <Page wide>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <Tabs
        value={page.state.tab}
        onValueChange={(next) => {
          const tab = QUEUE_TABS.find(({ value }) => value === next)
          if (tab) page.selectTab(tab.value)
        }}
        className="gap-5"
      >
        <TabsList aria-label="Queue">
          {QUEUE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {tab.value === 'pending' && pendingCount > 0 && (
                <Badge variant="warn" className="tabular-nums">
                  {formatNumber(pendingCount)}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {QUEUE_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <QueueBody page={page} />
          </TabsContent>
        ))}
      </Tabs>
      <ApprovalQueueBar page={page} />
      <BulkConfirm page={page} />
      <ApprovalReviewCredenza
        approvalId={page.reviewId}
        open={page.reviewOpen}
        onOpenChange={page.setReviewOpen}
        onDecided={invalidateApprovalQueue}
      />
    </Page>
  )
}
