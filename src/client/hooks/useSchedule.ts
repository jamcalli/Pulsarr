import type { ProgressEvent } from '@root/types/progress.types'
import { useCallback, useMemo } from 'react'
import { useJobStatusRefetch } from '@/hooks/useJobStatusRefetch'
import { useMinLoading, withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { startAndAwaitStatus } from '@/lib/background-job'
import type { OperationMeta } from '@/lib/operation-toasts'
import { scheduleKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch, loadErrorMessage } from '@/lib/tanstackApi'
import type { paths } from '@/types/api.js'

export type ScheduleStatus =
  paths['/v1/scheduler/schedules/{name}']['get']['responses'][200]['content']['application/json']

export function invalidateSchedule(name: string) {
  return queryClient.invalidateQueries({ queryKey: scheduleKeys.byName(name) })
}

export function getScheduleSnapshot(name: string): ScheduleStatus | null {
  return (
    queryClient.getQueryData<ScheduleStatus>(scheduleKeys.byName(name)) ?? null
  )
}

/** Saves a cron schedule and resolves once the schedule query has refetched. Throws the parsed error body on failure. */
export async function updateSchedule(
  name: string,
  { enabled, expression }: { enabled: boolean; expression: string },
): Promise<void> {
  const { error } = await apiFetch.PUT('/v1/scheduler/schedules/{name}', {
    params: { path: { name } },
    body: { type: 'cron', config: { expression }, enabled },
  })
  if (error) throw error
  await invalidateSchedule(name)
}

const RUN_FALLBACK = 'The run did not finish. Try again.'

function isJobEventFor(name: string) {
  return (event: ProgressEvent) =>
    event.metadata !== undefined &&
    'job' in event.metadata &&
    event.metadata.job === name
}

function fetchSchedule(name: string) {
  return queryClient.fetchQuery({
    ...$api.queryOptions('get', '/v1/scheduler/schedules/{name}', {
      params: { path: { name } },
    }),
    staleTime: 0,
  })
}

/** Starts the job and resolves with its row once the run ends, throwing the run's error when it failed. */
async function runJob(name: string): Promise<ScheduleStatus> {
  const schedule = await startAndAwaitStatus({
    eventType: 'scheduled-job',
    isJobEvent: isJobEventFor(name),
    start: async () => {
      const { error } = await apiFetch.POST(
        '/v1/scheduler/schedules/{name}/start',
        { params: { path: { name } } },
      )
      if (error) throw error
    },
    readStatus: () => fetchSchedule(name),
    isSettled: (row) => !row.running,
  })
  if (schedule.last_run?.status === 'failed') {
    throw { message: schedule.last_run.error ?? RUN_FALLBACK }
  }
  return schedule
}

/** `meta` names the run in the completion toast shown away from its page. */
export function useSchedule(name: string, meta: OperationMeta) {
  const query = useMinLoading(
    $api.useQuery('get', '/v1/scheduler/schedules/{name}', {
      params: { path: { name } },
    }),
  )
  const refetch = useCallback(() => invalidateSchedule(name), [name])
  const isJobEvent = useMemo(() => isJobEventFor(name), [name])
  useJobStatusRefetch('scheduled-job', refetch, isJobEvent)
  const run = useOperation({
    key: ['schedules', name, 'run'],
    mutationFn: () => withMinDuration(runJob(name)),
    onSettled: () => void refetch(),
    meta,
    errorFallback: RUN_FALLBACK,
  })
  const schedule = query.data ?? null

  return {
    schedule,
    isLoading: query.isLoading,
    errorMessage: loadErrorMessage(query, 'The schedule failed to load.'),
    retry: () => query.refetch(),
    run: { ...run, running: run.running || schedule?.running === true },
  }
}
