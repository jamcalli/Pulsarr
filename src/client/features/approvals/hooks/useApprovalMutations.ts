import type {
  BulkApprovalRequest,
  BulkDeleteRequest,
  BulkRejectRequest,
  UpdateApprovalRequest,
} from '@root/schemas/approval/approval.schema'
import { useMutation } from '@tanstack/react-query'
import { dashboardStatsKeys } from '@/features/dashboard/hooks/useDashboardStatsQuery'
import { recentRequestsKeys } from '@/features/dashboard/hooks/useRecentRequests'
import { queryClient } from '@/lib/queryClient'
import { apiFetch } from '@/lib/tanstackApi'
import { useMinLoadingMutation } from '@/lib/useMinLoading'
import { approvalStatsKeys } from './useApprovalStats'
import { approvalKeys } from './useApprovals'

/**
 * Invalidates both approval list and stats caches.
 * Called after mutations that affect approval state.
 */
function invalidateApprovalCaches() {
  queryClient.invalidateQueries({ queryKey: approvalKeys.all })
  queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
  queryClient.invalidateQueries({ queryKey: recentRequestsKeys.all })
  queryClient.invalidateQueries({ queryKey: dashboardStatsKeys.all })
}

/**
 * Mutation hook for approving a single request.
 */
export function useApproveRequest() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async ({ id, notes }: { id: number; notes?: string }) => {
        const { data, error } = await apiFetch.POST(
          '/v1/approval/requests/{id}/approve',
          { params: { path: { id } }, body: { notes } },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateApprovalCaches()
      },
    }),
  )
}

/**
 * Mutation hook for rejecting a single request.
 */
export function useRejectRequest() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
        const { data, error } = await apiFetch.POST(
          '/v1/approval/requests/{id}/reject',
          { params: { path: { id } }, body: { reason } },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateApprovalCaches()
      },
    }),
  )
}

/**
 * Mutation hook for deleting a single approval request.
 */
export function useDeleteApproval() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (id: number) => {
        const { error } = await apiFetch.DELETE('/v1/approval/requests/{id}', {
          params: { path: { id } },
        })
        if (error) throw error
      },
      onSuccess: () => {
        invalidateApprovalCaches()
      },
    }),
  )
}

/**
 * Mutation hook for updating an approval request (e.g., editing routing).
 * Resolves to the updated approval request.
 */
export function useUpdateApproval() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async ({
        id,
        updates,
      }: {
        id: number
        updates: UpdateApprovalRequest
      }) => {
        const { data, error } = await apiFetch.PATCH(
          '/v1/approval/requests/{id}',
          { params: { path: { id } }, body: updates },
        )
        if (error) throw error
        return data.approvalRequest
      },
      onSuccess: () => {
        invalidateApprovalCaches()
      },
    }),
  )
}

/**
 * Mutation hook for bulk approving multiple requests.
 */
export function useBulkApprove() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (params: BulkApprovalRequest) => {
        const { data, error } = await apiFetch.POST(
          '/v1/approval/requests/bulk/approve',
          { body: params },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateApprovalCaches()
      },
    }),
  )
}

/**
 * Mutation hook for bulk rejecting multiple requests.
 */
export function useBulkReject() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (params: BulkRejectRequest) => {
        const { data, error } = await apiFetch.POST(
          '/v1/approval/requests/bulk/reject',
          { body: params },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateApprovalCaches()
      },
    }),
  )
}

/**
 * Mutation hook for bulk deleting multiple requests.
 */
export function useBulkDelete() {
  return useMinLoadingMutation(
    useMutation({
      mutationFn: async (params: BulkDeleteRequest) => {
        const { data, error } = await apiFetch.DELETE(
          '/v1/approval/requests/bulk/delete',
          { body: params },
        )
        if (error) throw error
        return data
      },
      onSuccess: () => {
        invalidateApprovalCaches()
      },
    }),
  )
}
