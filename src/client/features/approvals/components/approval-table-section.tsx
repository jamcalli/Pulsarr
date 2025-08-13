import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import type {
  ApprovalMetadata,
  ProgressEvent,
} from '@root/types/progress.types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApprovalActionDialogs } from '@/features/approvals/components/approval-action-dialogs'
import ApprovalActionsModal from '@/features/approvals/components/approval-actions-modal'
import { ApprovalConfigurationSection } from '@/features/approvals/components/approval-configuration-section'
import ApprovalStatsHeader from '@/features/approvals/components/approval-stats-header'
import { ApprovalTable } from '@/features/approvals/components/approval-table'
import BulkApprovalModal from '@/features/approvals/components/bulk-approval-modal'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { useApprovalPageEvents } from '@/hooks/useApprovalEvents'

type BulkActionStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Displays the approval management interface, allowing users to view, filter, and manage approval requests with real-time updates and bulk actions.
 *
 * Integrates with the global approvals store to provide up-to-date approval requests and statistics, supports individual and bulk approval, rejection, and deletion, and manages user interactions through dialogs and modals. Real-time updates are handled via server-sent events. Shows loading indicators and error banners as needed.
 *
 * @returns The approval management UI, or `null` if initialization is not complete.
 */
export default function ApprovalTableSection() {
  const {
    approvalRequests,
    stats,
    isInitialized,
    approvalsLoading,
    error,
    initialize,
    refreshApprovalRequests,
    clearError,
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

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialize(true)
      hasInitializedRef.current = true
    }
  }, [initialize])

  // Memoize callback functions to prevent infinite re-renders
  const handleApprovalCreatedCallback = useCallback(
    (_: ProgressEvent, _metadata: ApprovalMetadata) => {
      // Refresh approval list to get complete data instead of constructing partial objects
      refreshApprovalRequests()
      fetchStats()
    },
    [refreshApprovalRequests, fetchStats],
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
    const selectedId = selectedRequest?.id

    // Refresh the approvals list
    await refreshApprovalRequests()

    // If we have a selected request, update it with fresh data
    if (selectedId) {
      // Get fresh state from the store after refresh
      const freshRequests = useApprovalsStore.getState().approvalRequests
      const updatedRequest = freshRequests.find((req) => req.id === selectedId)
      if (updatedRequest) {
        setSelectedRequest(updatedRequest)
      }
    }
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

  // Generic bulk action handler to reduce code duplication
  const handleBulkAction = async (
    action: 'approve' | 'reject' | 'delete',
    requestIds: string[],
    additionalData?: { notes?: string; reason?: string },
  ) => {
    setCurrentBulkAction(action)
    setBulkActionStatus('loading')

    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, MIN_LOADING_DELAY),
      )

      const endpoint = `/v1/approval/requests/bulk/${action}`
      const method = action === 'delete' ? 'DELETE' : 'POST'

      const requestBody = {
        requestIds: requestIds.map((id) => Number.parseInt(id, 10)),
        ...additionalData,
      }

      const [response] = await Promise.all([
        fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }),
        minimumLoadingTime,
      ])

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Failed to ${action} requests`)
      }

      await response.json() // Consume response but don't need result
      setBulkActionStatus('success')

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
      console.error(`Bulk ${action} error:`, error)
      setBulkActionStatus('error')
      toast.error(
        error instanceof Error ? error.message : `Failed to ${action} requests`,
      )
      await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
      setBulkActionStatus('idle')
      setCurrentBulkAction(null)
    }
  }

  // Simplified bulk action handlers
  const handleBulkApprove = (requestIds: string[]) =>
    handleBulkAction('approve', requestIds, { notes: undefined })

  const handleBulkReject = (requestIds: string[]) =>
    handleBulkAction('reject', requestIds, { reason: undefined })

  const handleBulkDelete = (requestIds: string[]) =>
    handleBulkAction('delete', requestIds)

  if (!isInitialized) {
    return null
  }

  if (approvalsLoading && approvalRequests.length === 0) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-8 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {['stat1', 'stat2', 'stat3', 'stat4'].map((stat) => (
            <Skeleton key={`stats-loading-${stat}`} className="h-20" />
          ))}
        </div>
        <div className="space-y-4">
          {['header', 'body', 'pagination'].map((section) => (
            <Skeleton key={`table-loading-${section}`} className="h-16" />
          ))}
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
        <h2 className="text-2xl font-bold text-foreground">
          Approval Management
        </h2>
      </div>

      {/* Stats overview */}
      <ApprovalStatsHeader stats={stats} loading={approvalsLoading} />

      {/* Configuration section */}
      <ApprovalConfigurationSection />

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
