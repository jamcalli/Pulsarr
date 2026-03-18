import type {
  BulkManageBody,
  BulkManageResponse,
  DeleteRollingMonitoredResponse,
  InactiveRollingMonitoredResponse,
  ResetInactiveShowsResponse,
  ResetRollingMonitoredResponse,
  RollingMonitoredListResponse,
  RunSessionMonitorResponse,
  SonarrShowsResponse,
} from '@root/schemas/session-monitoring/session-monitoring.schema'
import {
  BulkManageResponseSchema,
  DeleteRollingMonitoredResponseSchema,
  InactiveRollingMonitoredResponseSchema,
  ResetInactiveShowsResponseSchema,
  ResetRollingMonitoredResponseSchema,
  RollingMonitoredListResponseSchema,
  RunSessionMonitorResponseSchema,
  SonarrShowsResponseSchema,
} from '@root/schemas/session-monitoring/session-monitoring.schema'
import { apiClient } from '@/lib/apiClient'
import { queryClient } from '@/lib/queryClient'
import { useAppMutation, useAppQuery } from '@/lib/useAppQuery'

// Query key factory for session monitoring
export const sessionMonitoringKeys = {
  all: ['session-monitoring'] as const,
  rollingShows: () => [...sessionMonitoringKeys.all, 'rolling-shows'] as const,
  inactiveShows: (days: number) =>
    [...sessionMonitoringKeys.all, 'inactive-shows', { days }] as const,
  sonarrShows: (instanceId?: number) =>
    [...sessionMonitoringKeys.all, 'sonarr-shows', { instanceId }] as const,
}

function invalidateSessionMonitoringCaches() {
  queryClient.invalidateQueries({ queryKey: sessionMonitoringKeys.all })
}

// ============================================================================
// Query Hooks
// ============================================================================

export function useRollingShowsQuery(enabled: boolean) {
  return useAppQuery<RollingMonitoredListResponse>({
    queryKey: sessionMonitoringKeys.rollingShows(),
    queryFn: () =>
      apiClient.get(
        '/v1/session-monitoring/rolling-monitored',
        RollingMonitoredListResponseSchema,
      ),
    enabled,
  })
}

export function useInactiveShowsQuery(days: number, enabled: boolean) {
  return useAppQuery<InactiveRollingMonitoredResponse>({
    queryKey: sessionMonitoringKeys.inactiveShows(days),
    queryFn: () =>
      apiClient.get(
        `/v1/session-monitoring/rolling-monitored/inactive?inactivityDays=${days}`,
        InactiveRollingMonitoredResponseSchema,
      ),
    enabled,
  })
}

export function useSonarrShowsQuery(instanceId?: number, enabled = true) {
  const params = instanceId !== undefined ? `?instanceId=${instanceId}` : ''
  return useAppQuery<SonarrShowsResponse>({
    queryKey: sessionMonitoringKeys.sonarrShows(instanceId),
    queryFn: () =>
      apiClient.get(
        `/v1/session-monitoring/sonarr-shows${params}`,
        SonarrShowsResponseSchema,
      ),
    enabled,
  })
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useRunSessionMonitorMutation() {
  return useAppMutation<RunSessionMonitorResponse>({
    mutationFn: () =>
      apiClient.post(
        '/v1/session-monitoring/run',
        {},
        RunSessionMonitorResponseSchema,
      ),
    onSuccess: () => {
      invalidateSessionMonitoringCaches()
    },
  })
}

export function useResetShowMutation() {
  return useAppMutation<ResetRollingMonitoredResponse, Error, number>({
    mutationFn: (id) =>
      apiClient.post(
        `/v1/session-monitoring/rolling-monitored/${id}/reset`,
        {},
        ResetRollingMonitoredResponseSchema,
      ),
    onSuccess: () => {
      invalidateSessionMonitoringCaches()
    },
  })
}

export function useDeleteShowMutation() {
  return useAppMutation<DeleteRollingMonitoredResponse, Error, number>({
    mutationFn: (id) =>
      apiClient.delete(
        `/v1/session-monitoring/rolling-monitored/${id}?reset=false`,
        DeleteRollingMonitoredResponseSchema,
      ),
    onSuccess: () => {
      invalidateSessionMonitoringCaches()
    },
  })
}

export function useResetInactiveShowsMutation() {
  return useAppMutation<ResetInactiveShowsResponse, Error, number>({
    mutationFn: (inactivityDays) =>
      apiClient.post(
        '/v1/session-monitoring/rolling-monitored/reset-inactive',
        { inactivityDays },
        ResetInactiveShowsResponseSchema,
      ),
    onSuccess: () => {
      invalidateSessionMonitoringCaches()
    },
  })
}

export function useBulkManageMutation() {
  return useAppMutation<BulkManageResponse, Error, BulkManageBody>({
    mutationFn: (body) =>
      apiClient.post(
        '/v1/session-monitoring/rolling-monitored/bulk',
        body,
        BulkManageResponseSchema,
      ),
    onSuccess: () => {
      invalidateSessionMonitoringCaches()
    },
  })
}
