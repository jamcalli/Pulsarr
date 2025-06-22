import { useEffect, useRef, useState, useCallback } from 'react'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useApprovalPageEvents } from '@/hooks/useApprovalEvents'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { ApprovalTable } from './approval-table'
import { ApprovalActionDialogs } from './approval-action-dialogs'
import ApprovalStatsHeader from './approval-stats-header'
import ApprovalActionsModal from './approval-actions-modal'
import BulkApprovalModal from './bulk-approval-modal'
import type {
  ApprovalRequestResponse,
  BulkApprovalRequest,
  BulkRejectRequest,
  BulkDeleteRequest,
  BulkOperationResponse,
} from '@root/schemas/approval/approval.schema'
import type {
  ProgressEvent,
  ApprovalMetadata,
} from '@root/types/progress.types'

type BulkActionStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Table-based approvals section component that manages the approval queue interface.
 *
 * Provides comprehensive approval management with a data table interface including
 * filtering, sorting, pagination, and quick action buttons. Replaces the card-based
 * layout with a more efficient and professional table design.
 */
export default function ApprovalTableSection() {
  const {
    approvalRequests,
    stats,
    isInitialized,
    approvalsLoading,
    error,
    total,
    currentQuery,
    initialize,
    refreshApprovalRequests,
    clearError,
    handleApprovalCreated,
    handleApprovalDeleted,
    fetchStats,
  } = useApprovalsStore()

  const hasInitializedRef = useRef(false)
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequestResponse | null>(null)

  // Action dialog states
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [selectedBulkRequests, setSelectedBulkRequests] = useState<
    ApprovalRequestResponse[]
  >([])
  const [bulkActionStatus, setBulkActionStatus] =
    useState<BulkActionStatus>('idle')
  const [currentBulkAction, setCurrentBulkAction] = useState<
    'approve' | 'reject' | 'delete' | null
  >(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialize(true)
      hasInitializedRef.current = true
    }
  }, [initialize])

  // Memoize callback functions to prevent infinite re-renders
  const handleApprovalCreatedCallback = useCallback(
    (_: ProgressEvent, metadata: ApprovalMetadata) => {
      // Convert metadata to ApprovalRequestResponse format
      const newRequest: ApprovalRequestResponse = {
        id: metadata.requestId,
        userId: metadata.userId,
        userName: metadata.userName,
        contentType: metadata.contentType,
        contentTitle: metadata.contentTitle,
        status: metadata.status,
        // Set other required fields to defaults - they'll be fetched properly later
        contentKey: '',
        contentGuids: [],
        proposedRouterDecision: { action: 'route', routing: undefined },
        routerRuleId: null,
        triggeredBy: 'manual_flag',
        approvalReason: null,
        approvedBy: null,
        approvalNotes: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      handleApprovalCreated(newRequest)
      fetchStats()
    },
    [handleApprovalCreated, fetchStats],
  )

  const handleApprovalUpdatedCallback = useCallback(
    (_event: ProgressEvent, _metadata: ApprovalMetadata) => {
      refreshApprovalRequests()
      fetchStats()
    },
    [refreshApprovalRequests, fetchStats],
  )

  const handleApprovalApprovedCallback = useCallback(
    (_event: ProgressEvent, _metadata: ApprovalMetadata) => {
      refreshApprovalRequests()
      fetchStats()
    },
    [refreshApprovalRequests, fetchStats],
  )

  const handleApprovalRejectedCallback = useCallback(
    (_event: ProgressEvent, _metadata: ApprovalMetadata) => {
      refreshApprovalRequests()
      fetchStats()
    },
    [refreshApprovalRequests, fetchStats],
  )

  const handleApprovalDeletedCallback = useCallback(
    (_event: ProgressEvent, metadata: ApprovalMetadata) => {
      handleApprovalDeleted(metadata.requestId)
      fetchStats()
    },
    [handleApprovalDeleted, fetchStats],
  )

  // Set up SSE event handling for real-time updates (page-specific, no toasts)
  useApprovalPageEvents({
    onApprovalCreated: handleApprovalCreatedCallback,
    onApprovalUpdated: handleApprovalUpdatedCallback,
    onApprovalApproved: handleApprovalApprovedCallback,
    onApprovalRejected: handleApprovalRejectedCallback,
    onApprovalDeleted: handleApprovalDeletedCallback,
  })

  const handleApprove = (request: ApprovalRequestResponse) => {
    setSelectedRequest(request)
    setApproveDialogOpen(true)
  }

  const handleReject = (request: ApprovalRequestResponse) => {
    setSelectedRequest(request)
    setRejectDialogOpen(true)
  }

  const handleDelete = (request: ApprovalRequestResponse) => {
    setSelectedRequest(request)
    setDeleteDialogOpen(true)
  }

  const handleView = (request: ApprovalRequestResponse) => {
    setSelectedRequest(request)
    setViewModalOpen(true)
  }

  const handleActionComplete = async () => {
    await refreshApprovalRequests()
  }

  const closeApproveDialog = () => {
    setApproveDialogOpen(false)
    setSelectedRequest(null)
  }

  const closeRejectDialog = () => {
    setRejectDialogOpen(false)
    setSelectedRequest(null)
  }

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setSelectedRequest(null)
  }

  const closeViewModal = () => {
    setViewModalOpen(false)
    setSelectedRequest(null)
  }

  const handleBulkActions = (selectedRequests: ApprovalRequestResponse[]) => {
    setSelectedBulkRequests(selectedRequests)
    setBulkModalOpen(true)
  }

  const closeBulkModal = (newOpen: boolean) => {
    if (bulkActionStatus === 'loading') {
      return
    }
    if (!newOpen) {
      setBulkModalOpen(false)
      setSelectedBulkRequests([])
      setCurrentBulkAction(null)
    }
  }

  const handleBulkApprove = async (requestIds: string[]) => {
    setCurrentBulkAction('approve')
    setBulkActionStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const requestBody: BulkApprovalRequest = {
        requestIds: requestIds.map((id) => Number.parseInt(id, 10)),
        notes: undefined, // Optional notes field
      }

      const [response] = await Promise.all([
        fetch('/v1/approval/requests/bulk/approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to approve requests')
      }

      const result: BulkOperationResponse = await response.json()

      setBulkActionStatus('success')
      toast({
        description:
          result.message ||
          `Successfully approved ${requestIds.length} approval requests`,
        variant: 'default',
      })

      // Refresh data
      await handleActionComplete()

      // Show success state then close
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY / 2))
      setBulkModalOpen(false)

      // Reset status
      setTimeout(() => {
        setBulkActionStatus('idle')
        setCurrentBulkAction(null)
      }, 500)
    } catch (error) {
      console.error('Bulk approve error:', error)
      setBulkActionStatus('error')
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to approve requests',
        variant: 'destructive',
      })
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
      setBulkActionStatus('idle')
      setCurrentBulkAction(null)
    }
  }

  const handleBulkReject = async (requestIds: string[]) => {
    setCurrentBulkAction('reject')
    setBulkActionStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const requestBody: BulkRejectRequest = {
        requestIds: requestIds.map((id) => Number.parseInt(id, 10)),
        reason: undefined, // Optional reason field
      }

      const [response] = await Promise.all([
        fetch('/v1/approval/requests/bulk/reject', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to reject requests')
      }

      const result: BulkOperationResponse = await response.json()

      setBulkActionStatus('success')
      toast({
        description:
          result.message ||
          `Successfully rejected ${requestIds.length} approval requests`,
        variant: 'default',
      })

      // Refresh data
      await handleActionComplete()

      // Show success state then close
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY / 2))
      setBulkModalOpen(false)

      // Reset status
      setTimeout(() => {
        setBulkActionStatus('idle')
        setCurrentBulkAction(null)
      }, 500)
    } catch (error) {
      console.error('Bulk reject error:', error)
      setBulkActionStatus('error')
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to reject requests',
        variant: 'destructive',
      })
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
      setBulkActionStatus('idle')
      setCurrentBulkAction(null)
    }
  }

  const handleBulkDelete = async (requestIds: string[]) => {
    setCurrentBulkAction('delete')
    setBulkActionStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const requestBody: BulkDeleteRequest = {
        requestIds: requestIds.map((id) => Number.parseInt(id, 10)),
      }

      const [response] = await Promise.all([
        fetch('/v1/approval/requests/bulk/delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete requests')
      }

      const result: BulkOperationResponse = await response.json()

      setBulkActionStatus('success')
      toast({
        description:
          result.message ||
          `Successfully deleted ${requestIds.length} approval requests`,
        variant: 'default',
      })

      // Refresh data
      await handleActionComplete()

      // Show success state then close
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY / 2))
      setBulkModalOpen(false)

      // Reset status
      setTimeout(() => {
        setBulkActionStatus('idle')
        setCurrentBulkAction(null)
      }, 500)
    } catch (error) {
      console.error('Bulk delete error:', error)
      setBulkActionStatus('error')
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to delete requests',
        variant: 'destructive',
      })
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
      setBulkActionStatus('idle')
      setCurrentBulkAction(null)
    }
  }

  if (!isInitialized) {
    return null
  }

  if (approvalsLoading && approvalRequests.length === 0) {
    return (
      <div className="grid gap-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {['stat1', 'stat2', 'stat3', 'stat4'].map((stat) => (
              <div
                key={`stats-loading-${stat}`}
                className="h-20 bg-gray-200 dark:bg-gray-700 rounded"
              />
            ))}
          </div>
          <div className="space-y-4">
            {['header', 'body', 'pagination'].map((section) => (
              <div
                key={`table-loading-${section}`}
                className="h-16 bg-gray-200 dark:bg-gray-700 rounded"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-md p-4">
          <div className="flex justify-between items-center">
            <p className="text-red-800 dark:text-red-200">{error}</p>
            <Button variant="error" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Header with stats */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">Approval Management</h2>
      </div>

      {/* Stats overview */}
      <ApprovalStatsHeader stats={stats} loading={approvalsLoading} />

      {/* Results summary */}
      <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
        <span>
          Showing {approvalRequests.length} of {total} approval requests
          {currentQuery.status && (
            <span className="ml-1">(filtered by: {currentQuery.status})</span>
          )}
        </span>
        {currentQuery.limit && currentQuery.limit < total && (
          <span>
            Page{' '}
            {Math.floor((currentQuery.offset || 0) / currentQuery.limit) + 1} of{' '}
            {Math.ceil(total / currentQuery.limit)}
          </span>
        )}
      </div>

      {/* Approval requests table */}
      <ApprovalTable
        data={approvalRequests}
        onApprove={handleApprove}
        onReject={handleReject}
        onView={handleView}
        onDelete={handleDelete}
        onBulkActions={handleBulkActions}
        isLoading={approvalsLoading}
      />

      {/* Load more button if there are more results */}
      {total > approvalRequests.length && (
        <div className="text-center">
          <Button
            variant="noShadow"
            onClick={() => {
              refreshApprovalRequests()
            }}
            disabled={approvalsLoading}
          >
            Load More ({total - approvalRequests.length} remaining)
          </Button>
        </div>
      )}

      {/* Action dialogs */}
      <ApprovalActionDialogs
        selectedRequest={selectedRequest}
        approveDialogOpen={approveDialogOpen}
        rejectDialogOpen={rejectDialogOpen}
        deleteDialogOpen={deleteDialogOpen}
        onApproveDialogClose={closeApproveDialog}
        onRejectDialogClose={closeRejectDialog}
        onDeleteDialogClose={closeDeleteDialog}
        onActionComplete={handleActionComplete}
      />

      {/* View details modal */}
      {selectedRequest && (
        <ApprovalActionsModal
          request={selectedRequest}
          open={viewModalOpen}
          onOpenChange={closeViewModal}
          onUpdate={handleActionComplete}
        />
      )}

      {/* Bulk actions modal */}
      <BulkApprovalModal
        open={bulkModalOpen}
        onOpenChange={closeBulkModal}
        selectedRequests={selectedBulkRequests}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        onBulkDelete={handleBulkDelete}
        actionStatus={bulkActionStatus}
        currentAction={currentBulkAction}
      />
    </div>
  )
}
