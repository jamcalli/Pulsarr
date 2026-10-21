import { useCallback } from 'react'
import { useJobStatusRefetch } from '@/hooks/useJobStatusRefetch'
import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import {
  isRunSettled,
  requireRunDone,
  startAndAwaitStatus,
} from '@/lib/background-job'
import { NAV_PAGES } from '@/lib/navigation'
import { deleteSyncKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch, loadErrorMessage } from '@/lib/tanstackApi'

const ERROR_FALLBACK = 'The dry run did not finish. Try again.'

interface DryRunContext {
  /** `dryRunKey` of the saved settings the run used. */
  key: string
  nothingSelected: boolean
  deleteFiles: boolean
}

function fetchStatus() {
  return queryClient.fetchQuery({
    ...$api.queryOptions(
      'get',
      '/v1/scheduler/schedules/delete-sync/dry-run/status',
    ),
    staleTime: 0,
  })
}

async function startDryRun(context: DryRunContext) {
  const status = await startAndAwaitStatus({
    eventType: 'delete-sync-dry-run',
    start: async () => {
      const { error } = await apiFetch.POST(
        '/v1/scheduler/schedules/delete-sync/dry-run/start',
      )
      if (error) throw error
    },
    readStatus: fetchStatus,
    isSettled: isRunSettled,
  })
  requireRunDone(status, ERROR_FALLBACK)
  return { startedAt: status.startedAt, context }
}

/** A dry run started elsewhere, or before a reload, is shown with `saved` since only this tab knows its own run's settings. */
export function useDryRun(saved: DryRunContext) {
  const query = $api.useQuery(
    'get',
    '/v1/scheduler/schedules/delete-sync/dry-run/status',
  )
  const refetch = useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: deleteSyncKeys.dryRunStatus }),
    [],
  )
  useJobStatusRefetch('delete-sync-dry-run', refetch)
  const operation = useOperation({
    key: ['delete-sync', 'dry-run'],
    mutationFn: (context: DryRunContext) =>
      withMinDuration(startDryRun(context)),
    meta: { label: 'Delete sync dry run', page: NAV_PAGES.deleteSync },
    errorFallback: ERROR_FALLBACK,
    onSettled: () => void refetch(),
  })

  const status = query.data
  const own = operation.result?.data
  const context =
    own && own.startedAt === status?.startedAt ? own.context : saved
  const result =
    status?.state === 'done' && status.result && status.startedAt
      ? {
          ranAt: Date.parse(status.startedAt),
          data: { ...context, results: status.result.results },
        }
      : null
  const serverError = status?.state === 'failed' ? status.error : null

  return {
    running: operation.running || status?.state === 'running',
    errorMessage:
      operation.errorMessage ??
      serverError ??
      loadErrorMessage(query, "Couldn't load the last dry run."),
    result,
    run: () => operation.run(saved),
  }
}
