import {
  type ApprovalRequestResponse,
  ApprovalRequestUpdateResponseSchema,
  ApprovalSuccessResponseSchema,
  type BulkApprovalRequest,
  type BulkDeleteRequest,
  type BulkOperationResponse,
  BulkOperationResponseSchema,
  type BulkRejectRequest,
  type UpdateApprovalRequest,
} from '@root/schemas/approval/approval.schema'
import { apiClient } from '@/lib/apiClient'
import { queryClient } from '@/lib/queryClient'
import { useAppMutation } from '@/lib/useAppQuery'
import { approvalStatsKeys } from './useApprovalStats'
import { approvalKeys } from './useApprovals'

/**
 * Invalidates both approval list and stats caches.
 * Called after mutations that affect approval state.
 */
function invalidateApprovalCaches() {
  queryClient.invalidateQueries({ queryKey: approvalKeys.all })
  queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
}

// ============================================================================
// Single Item Mutations
// ============================================================================

/**
 * Mutation hook for approving a single request.
 *
 * @example
 * ```typescript
 * const { mutate, isPending } = useApproveRequest()
 * mutate({ id: 123, notes: 'Approved by admin' })
 * ```
 */
export function useApproveRequest() {
  return useAppMutation({
    mutationFn: async ({ id, notes }: { id: number; notes?: string }) => {
      return apiClient.post(
        `/v1/approval/requests/${id}/approve`,
        { notes },
        ApprovalSuccessResponseSchema,
      )
    },
    onSuccess: () => {
      invalidateApprovalCaches()
    },
  })
}

/**
 * Mutation hook for rejecting a single request.
 *
 * @example
 * ```typescript
 * const { mutate, isPending } = useRejectRequest()
 * mutate({ id: 123, reason: 'Content not appropriate' })
 * ```
 */
export function useRejectRequest() {
  return useAppMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      return apiClient.post(
        `/v1/approval/requests/${id}/reject`,
        { reason },
        ApprovalSuccessResponseSchema,
      )
    },
    onSuccess: () => {
      invalidateApprovalCaches()
    },
  })
}

/**
 * Mutation hook for deleting a single approval request.
 *
 * @example
 * ```typescript
 * const { mutate, isPending } = useDeleteApproval()
 * mutate(123) // Delete request with ID 123
 * ```
 */
export function useDeleteApproval() {
  return useAppMutation({
    mutationFn: async (id: number) => {
      return apiClient.delete<void>(`/v1/approval/requests/${id}`)
    },
    onSuccess: () => {
      invalidateApprovalCaches()
    },
  })
}

/**
 * Mutation hook for updating an approval request (e.g., editing routing).
 *
 * @example
 * ```typescript
 * const { mutate, isPending } = useUpdateApproval()
 * mutate({
 *   id: 123,
 *   updates: { proposedRouterDecision: { ... } }
 * })
 * ```
 */
export function useUpdateApproval() {
  return useAppMutation<
    ApprovalRequestResponse,
    Error,
    { id: number; updates: UpdateApprovalRequest }
  >({
    mutationFn: async ({ id, updates }) => {
      const response = await apiClient.patch(
        `/v1/approval/requests/${id}`,
        updates,
        ApprovalRequestUpdateResponseSchema,
      )
      return response.approvalRequest
    },
    onSuccess: () => {
      invalidateApprovalCaches()
    },
  })
}

// ============================================================================
// Bulk Mutations
// ============================================================================

/**
 * Mutation hook for bulk approving multiple requests.
 *
 * @example
 * ```typescript
 * const { mutate, isPending } = useBulkApprove()
 * mutate({ requestIds: [1, 2, 3], notes: 'Batch approved' })
 * ```
 */
export function useBulkApprove() {
  return useAppMutation<BulkOperationResponse, Error, BulkApprovalRequest>({
    mutationFn: async (params) => {
      return apiClient.post(
        '/v1/approval/requests/bulk/approve',
        params,
        BulkOperationResponseSchema,
      )
    },
    onSuccess: () => {
      invalidateApprovalCaches()
    },
  })
}

/**
 * Mutation hook for bulk rejecting multiple requests.
 *
 * @example
 * ```typescript
 * const { mutate, isPending } = useBulkReject()
 * mutate({ requestIds: [1, 2, 3], reason: 'Does not meet criteria' })
 * ```
 */
export function useBulkReject() {
  return useAppMutation<BulkOperationResponse, Error, BulkRejectRequest>({
    mutationFn: async (params) => {
      return apiClient.post(
        '/v1/approval/requests/bulk/reject',
        params,
        BulkOperationResponseSchema,
      )
    },
    onSuccess: () => {
      invalidateApprovalCaches()
    },
  })
}

/**
 * Mutation hook for bulk deleting multiple requests.
 *
 * @example
 * ```typescript
 * const { mutate, isPending } = useBulkDelete()
 * mutate({ requestIds: [1, 2, 3] })
 * ```
 */
export function useBulkDelete() {
  return useAppMutation<BulkOperationResponse, Error, BulkDeleteRequest>({
    mutationFn: async (params) => {
      return apiClient.deleteWithBody(
        '/v1/approval/requests/bulk/delete',
        params,
        BulkOperationResponseSchema,
      )
    },
    onSuccess: () => {
      invalidateApprovalCaches()
    },
  })
}
