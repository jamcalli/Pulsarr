import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageError } from '@/components/page-error'
import { TableSkeleton } from '@/components/table/table-skeleton'
import { UtilitySectionHeader } from '@/components/utility-section-header'
import {
  type RetryAllScope,
  RoutingFailuresTable,
} from '@/features/requests/components/routing-failures/routing-failures-table'
import type { RoutingFailureRow } from '@/features/requests/components/routing-failures/routing-failures-table-columns'
import {
  useRetryAllRoutingFailures,
  useRetryRoutingFailure,
  useRoutingFailures,
} from '@/features/requests/hooks/routing-failures/useRoutingFailures'
import { useRoutingFailureSummary } from '@/hooks/useRoutingFailureSummary'
import { apiErrorMessage } from '@/lib/tanstackApi'

const DESCRIPTION =
  'Watchlist items that never made it into Radarr or Sonarr, with the reason and a retry. Retries go through the normal routing path, so approval rules, quotas and exclusions still apply.'

export function RoutingFailuresPage() {
  const [searchParams] = useSearchParams()
  const initialUserId = searchParams.get('userId') ?? undefined

  const failuresQuery = useRoutingFailures()
  const { data: summaryData } = useRoutingFailureSummary()
  const retryOne = useRetryRoutingFailure()
  const retryAll = useRetryAllRoutingFailures()
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  const failures = failuresQuery.data?.failures ?? []
  const summary = summaryData?.summary

  const userFilterOptions = React.useMemo(() => {
    const users = new Map<number, string>()
    for (const failure of failures) {
      users.set(failure.user_id, failure.username)
    }
    return [...users.entries()]
      .map(([id, name]) => ({ label: name, value: String(id) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [failures])

  const handleRetry = async (row: RoutingFailureRow) => {
    try {
      const result = await retryOne.mutateAsync(row.watchlist_item_id)
      if (result.result.resolved > 0) {
        toast.success(`"${row.title}" no longer fails to add`)
      } else {
        toast.error(`"${row.title}" still fails to add`)
      }
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'Failed to retry')
    }
  }

  const handleRetryAll = async (scope: RetryAllScope) => {
    try {
      const result = await retryAll.mutateAsync({
        userId: scope.userId,
        category: scope.category as RoutingFailureRow['category'] | undefined,
      })
      if (result.result.attempted === 0 && result.result.skipped === 0) {
        toast.info('Nothing to retry')
      } else {
        toast.success(result.message)
      }
    } catch (error) {
      toast.error(apiErrorMessage(error) ?? 'Failed to retry')
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await failuresQuery.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  if (failuresQuery.error && !failuresQuery.data) {
    return (
      <PageError
        message={
          apiErrorMessage(failuresQuery.error) ??
          'Failed to load routing failures'
        }
        onRetry={() => failuresQuery.refetch()}
      />
    )
  }

  return (
    <div>
      <UtilitySectionHeader
        title="Failed to Add"
        description={DESCRIPTION}
        showStatus={false}
      />

      {summary && summary.total > 0 && (
        <p className="text-sm text-foreground">
          <span className="font-medium">{summary.actionable}</span>{' '}
          {summary.actionable === 1 ? 'item needs' : 'items need'} attention
          {summary.byCategory.missing_ids > 0 && (
            <span className="text-muted-foreground">
              {' '}
              · {summary.byCategory.missing_ids} missing IDs (harmless, Retry
              All skips them)
            </span>
          )}
        </p>
      )}

      <div className="mt-2">
        {failuresQuery.isLoading || failuresQuery.data === undefined ? (
          <TableSkeleton
            rows={10}
            columns={[
              { type: 'text', width: 'w-full max-w-75' },
              { type: 'text', width: 'w-24' },
              { type: 'badge', className: 'w-25' },
              { type: 'text', width: 'w-24', hideOnMobile: true },
              { type: 'text', width: 'w-40', hideOnMobile: true },
              { type: 'button', width: 'w-24' },
            ]}
            showHeader={true}
          />
        ) : (
          <RoutingFailuresTable
            data={failures}
            userFilterOptions={userFilterOptions}
            initialUserId={initialUserId}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onRetry={handleRetry}
            retryingItemId={
              retryOne.isPending ? (retryOne.variables ?? null) : null
            }
            onRetryAll={handleRetryAll}
            isRetryingAll={retryAll.isPending}
          />
        )}
      </div>
    </div>
  )
}

export default RoutingFailuresPage
