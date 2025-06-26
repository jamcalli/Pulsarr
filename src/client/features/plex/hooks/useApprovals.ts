import { useCallback } from 'react'
import { toast } from 'sonner'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import type {
  GetApprovalRequestsQuery,
  UpdateApprovalRequest,
} from '@root/schemas/approval/approval.schema'

/**
 * React hook that centralizes approval request management, providing data, state, CRUD operations, statistics retrieval, and filtering utilities for use in components.
 *
 * All asynchronous actions are wrapped with error handling and toast notifications for user feedback. The hook exposes both high-level action handlers (with toasts) and raw state setters, as well as utility functions for filtering and computing approval request data.
 *
 * @returns An object containing approval request data, statistics, loading and error states, action methods with error handling, raw setters, utility functions for filtering, and computed metrics for use in React components.
 */
export function useApprovals() {
  const {
    approvalRequests,
    stats,
    approvalsLoading,
    error,
    total,
    currentQuery,
    isInitialized,
    initialize,
    fetchApprovalRequests,
    refreshApprovalRequests,
    updateApprovalRequest,
    deleteApprovalRequest,
    approveRequest,
    rejectRequest,
    fetchStats,
    setQuery,
    clearError,
  } = useApprovalsStore()

  const handleApproveRequest = useCallback(
    async (requestId: number, notes?: string) => {
      try {
        await approveRequest(requestId, notes)
      } catch (error) {
        toast.error('Failed to approve request')
        throw error
      }
    },
    [approveRequest],
  )

  const handleRejectRequest = useCallback(
    async (requestId: number, reason?: string) => {
      try {
        await rejectRequest(requestId, reason)
      } catch (error) {
        toast.error('Failed to reject request')
        throw error
      }
    },
    [rejectRequest],
  )

  const handleUpdateRequest = useCallback(
    async (requestId: number, updates: UpdateApprovalRequest) => {
      try {
        await updateApprovalRequest(requestId, updates)
        toast.success('Approval request updated successfully')
      } catch (error) {
        toast.error('Failed to update approval request')
        throw error
      }
    },
    [updateApprovalRequest],
  )

  const handleDeleteRequest = useCallback(
    async (requestId: number) => {
      try {
        await deleteApprovalRequest(requestId)
      } catch (error) {
        toast.error('Failed to delete approval request')
        throw error
      }
    },
    [deleteApprovalRequest],
  )

  const handleFetchRequests = useCallback(
    async (query?: Partial<GetApprovalRequestsQuery>) => {
      try {
        await fetchApprovalRequests(query)
      } catch (error) {
        toast.error('Failed to fetch approval requests')
        throw error
      }
    },
    [fetchApprovalRequests],
  )

  const handleRefreshRequests = useCallback(async () => {
    try {
      await refreshApprovalRequests()
    } catch (error) {
      toast.error('Failed to refresh approval requests')
      throw error
    }
  }, [refreshApprovalRequests])

  const handleInitialize = useCallback(
    async (force = false) => {
      try {
        await initialize(force)
      } catch (error) {
        toast.error('Failed to initialize approvals')
        throw error
      }
    },
    [initialize],
  )

  const handleFetchStats = useCallback(async () => {
    try {
      await fetchStats()
    } catch (error) {
      toast.error('Failed to fetch approval statistics')
      throw error
    }
  }, [fetchStats])

  // Utility functions
  const getPendingRequests = useCallback(() => {
    return approvalRequests.filter((request) => request.status === 'pending')
  }, [approvalRequests])

  const getRequestsByStatus = useCallback(
    (status: string) => {
      return approvalRequests.filter((request) => request.status === status)
    },
    [approvalRequests],
  )

  const getRequestsByUser = useCallback(
    (userId: number) => {
      return approvalRequests.filter((request) => request.userId === userId)
    },
    [approvalRequests],
  )

  const getExpiredRequests = useCallback(() => {
    const now = new Date()
    return approvalRequests.filter(
      (request) =>
        request.status === 'pending' &&
        request.expiresAt &&
        new Date(request.expiresAt) < now,
    )
  }, [approvalRequests])

  return {
    // Data
    approvalRequests,
    stats,
    total,
    currentQuery,

    // State
    loading: approvalsLoading,
    error,
    isInitialized,

    // Actions with error handling
    initialize: handleInitialize,
    fetchRequests: handleFetchRequests,
    refreshRequests: handleRefreshRequests,
    approveRequest: handleApproveRequest,
    rejectRequest: handleRejectRequest,
    updateRequest: handleUpdateRequest,
    deleteRequest: handleDeleteRequest,
    fetchStats: handleFetchStats,

    // Raw actions (without toast notifications)
    setQuery,
    clearError,

    // Utility functions
    getPendingRequests,
    getRequestsByStatus,
    getRequestsByUser,
    getExpiredRequests,

    // Computed values
    hasPendingRequests: getPendingRequests().length > 0,
    pendingCount: getPendingRequests().length,
    expiredCount: getExpiredRequests().length,
  }
}
