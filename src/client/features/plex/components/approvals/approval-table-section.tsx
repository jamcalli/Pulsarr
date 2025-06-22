import { useEffect, useRef, useState } from 'react'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { ApprovalTable } from './approval-table'
import { ApprovalActionDialogs } from './approval-action-dialogs'
import ApprovalStatsHeader from './approval-stats-header'
import ApprovalActionsModal from './approval-actions-modal'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

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
  } = useApprovalsStore()

  const hasInitializedRef = useRef(false)
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequestResponse | null>(null)

  // Action dialog states
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)

  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialize(true)
      hasInitializedRef.current = true
    }
  }, [initialize])

  const handleRefresh = async () => {
    try {
      await refreshApprovalRequests()
    } catch (error) {
      console.error('Failed to refresh approval requests:', error)
    }
  }

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
        <div className="flex gap-2">
          <Button
            variant="noShadow"
            size="sm"
            onClick={handleRefresh}
            disabled={approvalsLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${approvalsLoading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
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
    </div>
  )
}
