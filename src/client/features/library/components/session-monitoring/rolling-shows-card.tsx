import { Info } from 'lucide-react'
import { CardHeaderWithActions } from '@/components/card-header-with-actions'
import { CardTitleCount } from '@/components/card-title-count'
import { DataTableFooter } from '@/components/data-table/data-table-footer'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import {
  NoRollingShowsEmpty,
  RollingShowsNoResults,
} from '@/features/library/components/session-monitoring/rolling-shows-empty'
import { RollingShowsFilters } from '@/features/library/components/session-monitoring/rolling-shows-filters'
import { RollingShowsTable } from '@/features/library/components/session-monitoring/rolling-shows-table'
import type { SessionMonitoringPage } from '@/features/library/hooks/session-monitoring/useSessionMonitoringPage'
import {
  inactiveMeaning,
  pausedNotice,
} from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { formatNumber } from '@/lib/format'

interface RollingShowsCardProps {
  page: SessionMonitoringPage
  /** The saved switch, which pauses rolling and locks enrollment while off. */
  enabled: boolean
  inactivityDays: number
  onManage: () => void
}

export function RollingShowsCard({
  page,
  enabled,
  inactivityDays,
  onManage,
}: RollingShowsCardProps) {
  const all = page.all ?? []
  const rows = page.rows ?? []
  const hasShows = all.length > 0
  const inactiveCount = page.inactive.length

  const body = !hasShows ? (
    <NoRollingShowsEmpty onManage={onManage} />
  ) : rows.length === 0 ? (
    <RollingShowsNoResults page={page} inactivityDays={inactivityDays} />
  ) : (
    <RollingShowsTable page={page} rows={rows} />
  )
  const description = hasShows
    ? inactiveMeaning(inactivityDays)
    : 'Rolling shows grow as people watch them.'
  const actions = hasShows ? (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!enabled}
        onClick={onManage}
      >
        Manage enrollment
      </Button>
      {inactiveCount > 0 && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() =>
            page.openConfirm({
              kind: 'resetInactive',
              titles: page.inactive.map((row) => row.record.show_title),
            })
          }
        >
          Reset {formatNumber(inactiveCount)} inactive
        </Button>
      )}
    </>
  ) : undefined

  return (
    <Card>
      <CardHeaderWithActions actions={actions}>
        <CardTitleCount title="Rolling shows" count={all.length} />
        <CardDescription>{description}</CardDescription>
      </CardHeaderWithActions>
      <CardContent className="gap-4">
        {!enabled && hasShows && (
          <Alert variant="info" role="status">
            <Info />
            <AlertTitle>{pausedNotice(all.length)}</AlertTitle>
          </Alert>
        )}
        {hasShows && <RollingShowsFilters page={page} />}
        {body}
        <DataTableFooter
          page={page.page}
          pageSize={page.pageSize}
          onPageSizeChange={page.setPageSize}
          total={page.total}
          pageHref={page.pageHref}
          onPageChange={page.setPage}
        />
      </CardContent>
    </Card>
  )
}
