import { useMinLoading, withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import type { OperationMeta } from '@/lib/operation-toasts'
import { scheduleKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
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

/** `meta` names the run in the completion toast shown away from its page. */
export function useSchedule(name: string, meta: OperationMeta) {
  const query = useMinLoading(
    $api.useQuery('get', '/v1/scheduler/schedules/{name}', {
      params: { path: { name } },
    }),
  )
  const run = useOperation({
    key: ['schedules', name, 'run'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/scheduler/schedules/{name}/run', {
          params: { path: { name } },
        }),
      )
      if (error) throw error
      return data
    },
    onSettled: () => invalidateSchedule(name),
    meta,
    errorFallback: 'The run did not finish. Try again.',
  })

  return {
    schedule: query.data ?? null,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'The schedule failed to load.')
      : null,
    retry: () => query.refetch(),
    run,
  }
}
