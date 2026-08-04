import type { BulkManageBody } from '@root/schemas/session-monitoring/session-monitoring.schema'
import { useMutation } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { $api, apiFetch } from '@/lib/tanstackApi'
import { useMinLoading, useMinLoadingMutation } from '@/lib/useMinLoading'

/**
 * Invalidates every session monitoring query regardless of params by
 * matching on the path element of the [method, path, params] key shape.
 */
function invalidateSessionMonitoringCaches() {
  queryClient.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[1] === 'string' &&
      query.queryKey[1].startsWith('/v1/session-monitoring'),
  })
}

export function useRollingShowsQuery(enabled: boolean) {
  return useMinLoading(
    $api.useQuery(
      'get',
      '/v1/session-monitoring/rolling-monitored',
      {},
      { enabled },
    ),
  )
}

export function useInactiveShowsQuery(days: number, enabled: boolean) {
  return useMinLoading(
    $api.useQuery(
      'get',
      '/v1/session-monitoring/rolling-monitored/inactive',
      { params: { query: { inactivityDays: days } } },
      { enabled },
    ),
  )
}

export function useSonarrShowsQuery(instanceId?: number, enabled = true) {
  return useMinLoading(
    $api.useQuery(
      'get',
      '/v1/session-monitoring/sonarr-shows',
      {
        params: {
          query: instanceId !== undefined ? { instanceId } : {},
        },
      },
      { enabled },
    ),
  )
}

export function useRunSessionMonitorMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await apiFetch.POST(
          '/v1/session-monitoring/run',
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateSessionMonitoringCaches()
      },
    }),
  )
}

export function useResetShowMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { data, error } = await apiFetch.POST(
          '/v1/session-monitoring/rolling-monitored/{id}/reset',
          { params: { path: { id } } },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateSessionMonitoringCaches()
      },
    }),
  )
}

export function useDeleteShowMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { data, error } = await apiFetch.DELETE(
          '/v1/session-monitoring/rolling-monitored/{id}',
          { params: { path: { id }, query: { reset: 'false' } } },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateSessionMonitoringCaches()
      },
    }),
  )
}

export function useResetInactiveShowsMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (inactivityDays: number) => {
        const { data, error } = await apiFetch.POST(
          '/v1/session-monitoring/rolling-monitored/reset-inactive',
          { body: { inactivityDays } },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateSessionMonitoringCaches()
      },
    }),
  )
}

export function useBulkManageMutation() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (body: BulkManageBody) => {
        const { data, error } = await apiFetch.POST(
          '/v1/session-monitoring/rolling-monitored/bulk',
          { body },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateSessionMonitoringCaches()
      },
    }),
  )
}
