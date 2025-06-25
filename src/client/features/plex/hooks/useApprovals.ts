import { useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import type {
  GetApprovalRequestsQuery,
  UpdateApprovalRequest,
} from '@root/schemas/approval/approval.schema'

/**
 * Custom hook for approval request management operations.
 *
 * Provides convenient methods for CRUD operations on approval requests
 * with integrated error handling and toast notifications. Follows the
 * established pattern from other service hooks in the codebase.
 */
export function useApprovals() {
  const { toast } = useToast()
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
        toast({
          title: 'Error',
          description: 'Failed to approve request',
          variant: 'destructive',
        })
        throw error
      }
    },
    [approveRequest, toast],
  )

  const handleRejectRequest = useCallback(
    async (requestId: number, reason?: string) => {
      try {
        await rejectRequest(requestId, reason)
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to reject request',
          variant: 'destructive',
        })
        throw error
      }
    },
    [rejectRequest, toast],
  )

  const handleUpdateRequest = useCallback(
    async (requestId: number, updates: UpdateApprovalRequest) => {
      try {
        await updateApprovalRequest(requestId, updates)
        toast({
          title: 'Success',
          description: 'Approval request updated successfully',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to update approval request',
          variant: 'destructive',
        })
        throw error
      }
    },
    [updateApprovalRequest, toast],
  )

  const handleDeleteRequest = useCallback(
    async (requestId: number) => {
      try {
        await deleteApprovalRequest(requestId)
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete approval request',
          variant: 'destructive',
        })
        throw error
      }
    },
    [deleteApprovalRequest, toast],
  )

  const handleFetchRequests = useCallback(
    async (query?: Partial<GetApprovalRequestsQuery>) => {
      try {
        await fetchApprovalRequests(query)
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to fetch approval requests',
          variant: 'destructive',
        })
        throw error
      }
    },
    [fetchApprovalRequests, toast],
  )

  const handleRefreshRequests = useCallback(async () => {
    try {
      await refreshApprovalRequests()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to refresh approval requests',
        variant: 'destructive',
      })
      throw error
    }
  }, [refreshApprovalRequests, toast])

  const handleInitialize = useCallback(
    async (force = false) => {
      try {
        await initialize(force)
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to initialize approvals',
          variant: 'destructive',
        })
        throw error
      }
    },
    [initialize, toast],
  )

  const handleFetchStats = useCallback(async () => {
    try {
      await fetchStats()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch approval statistics',
        variant: 'destructive',
      })
      throw error
    }
  }, [fetchStats, toast])

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
