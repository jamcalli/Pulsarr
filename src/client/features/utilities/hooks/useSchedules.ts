import type { ScheduleUpdate } from '@root/schemas/scheduler/scheduler.schema'
import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch } from '@/lib/tanstackApi'
import {
  useMinLoading,
  useMinLoadingMutation,
  withMinDuration,
} from '@/lib/useMinLoading'

export const scheduleKeys = {
  all: $api.queryOptions('get', '/v1/scheduler/schedules').queryKey,
}

export function invalidateSchedules() {
  return queryClient.invalidateQueries({ queryKey: scheduleKeys.all })
}

/**
 * Fetches all scheduler jobs. Data is shared across every page that reads
 * schedules (delete sync, plex labels, session monitoring, approvals).
 */
export function useSchedules() {
  return useMinLoading($api.useQuery('get', '/v1/scheduler/schedules'))
}

/**
 * Schedule mutations resolve to the server's success flag and resolve false
 * on error - callers branch on the boolean instead of catching. Each
 * refreshes the schedules query after a successful call.
 */
export function useScheduleActions() {
  const runMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async (name: string) => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/scheduler/schedules/{name}/run', {
            params: { path: { name } },
          }),
        )
        if (error) throw error
        return data
      },
      onSuccess: () => invalidateSchedules(),
    }),
  )

  const toggleMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async ({
        name,
        enabled,
      }: {
        name: string
        enabled: boolean
      }) => {
        const { data, error } = await withMinDuration(
          apiFetch.PATCH('/v1/scheduler/schedules/{name}/toggle', {
            params: { path: { name } },
            body: { enabled },
          }),
        )
        if (error) throw error
        return data
      },
      onSuccess: () => invalidateSchedules(),
    }),
  )

  const updateMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async ({
        name,
        scheduleUpdate,
      }: {
        name: string
        scheduleUpdate: ScheduleUpdate
      }) => {
        const { data, error } = await withMinDuration(
          apiFetch.PUT('/v1/scheduler/schedules/{name}', {
            params: { path: { name } },
            body: scheduleUpdate,
          }),
        )
        if (error) throw error
        return data
      },
      onSuccess: () => invalidateSchedules(),
    }),
  )

  const runMutateAsync = runMutation.mutateAsync
  const runScheduleNow = useCallback(
    async (name: string) => {
      try {
        const data = await runMutateAsync(name)
        return data.success
      } catch (_err) {
        return false
      }
    },
    [runMutateAsync],
  )

  const toggleMutateAsync = toggleMutation.mutateAsync
  const toggleScheduleStatus = useCallback(
    async (name: string, enabled: boolean) => {
      try {
        const data = await toggleMutateAsync({ name, enabled })
        return data.success
      } catch (_err) {
        return false
      }
    },
    [toggleMutateAsync],
  )

  const updateMutateAsync = updateMutation.mutateAsync
  const updateSchedule = useCallback(
    async (name: string, scheduleUpdate: ScheduleUpdate) => {
      try {
        const data = await updateMutateAsync({ name, scheduleUpdate })
        return data.success
      } catch (_err) {
        return false
      }
    },
    [updateMutateAsync],
  )

  const updateSessionMonitorSchedule = useCallback(
    (scheduleName: string, intervalMinutes: number) =>
      updateSchedule(scheduleName, {
        type: 'interval',
        config: { minutes: intervalMinutes },
      }),
    [updateSchedule],
  )

  const updateAutoResetSchedule = useCallback(
    (scheduleName: string, intervalHours: number) =>
      updateSchedule(scheduleName, {
        type: 'interval',
        config: { hours: intervalHours },
      }),
    [updateSchedule],
  )

  return {
    runScheduleNow,
    toggleScheduleStatus,
    updateSchedule,
    updateSessionMonitorSchedule,
    updateAutoResetSchedule,
    isRunningSchedule: runMutation.isPending,
    isTogglingSchedule: toggleMutation.isPending,
    isUpdatingSchedule: updateMutation.isPending,
  }
}
