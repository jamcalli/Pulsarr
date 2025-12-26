import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApprovalActionDialogs } from '@/features/approvals/components/approval-action-dialogs'
import ApprovalActionsModal from '@/features/approvals/components/approval-actions-modal'
import { ApprovalConfigurationSection } from '@/features/approvals/components/approval-configuration-section'
import ApprovalStatsHeader from '@/features/approvals/components/approval-stats-header'
import { ApprovalTable } from '@/features/approvals/components/approval-table'
import BulkApprovalModal from '@/features/approvals/components/bulk-approval-modal'
import {
  useBulkApprove,
  useBulkDelete,
  useBulkReject,
} from '@/features/approvals/hooks/useApprovalMutations'
import { useApprovalStats } from '@/features/approvals/hooks/useApprovalStats'
import { useApprovals } from '@/features/approvals/hooks/useApprovals'
import { useApprovalPageEvents } from '@/hooks/useApprovalEvents'
import { queryClient } from '@/lib/queryClient'
import { approvalStatsKeys } from '../hooks/useApprovalStats'
import { approvalKeys } from '../hooks/useApprovals'

type BulkActionStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Displays the approval management interface with real-time updates and bulk actions.
 *
 * Uses React Query for data fetching and mutations.
 */
export default function ApprovalTableSection() {
  // Query hooks
  const {
    data: approvalsData,
    isLoading: approvalsLoading,
    error: approvalsError,
  } = useApprovals()
  const { data: statsData, isLoading: statsLoading } = useApprovalStats()

  // Mutation hooks
  const bulkApprove = useBulkApprove()
  const bulkReject = useBulkReject()
  const bulkDelete = useBulkDelete()

  // Local UI state
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequestResponse | null>(null)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [selectedBulkRequests, setSelectedBulkRequests] = useState<
    ApprovalRequestResponse[]
  >([])
  const [currentBulkAction, setCurrentBulkAction] = useState<
    'approve' | 'reject' | 'delete' | null
  >(null)

  // SSE event handling - invalidate cache on real-time updates
  useApprovalPageEvents({
    onApprovalCreated: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all })
      queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
    },
    onApprovalUpdated: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all })
      queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
    },
    onApprovalApproved: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all })
      queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
    },
    onApprovalRejected: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all })
      queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
    },
    onApprovalDeleted: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all })
      queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
    },
  })

  // Action handlers
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

  const handleBulkActions = (requests: ApprovalRequestResponse[]) => {
    setSelectedBulkRequests(requests)
    setBulkModalOpen(true)
  }

  // Bulk action status derived from mutation states
  const getBulkActionStatus = (): BulkActionStatus => {
    if (bulkApprove.isPending || bulkReject.isPending || bulkDelete.isPending) {
      return 'loading'
    }
    if (bulkApprove.isSuccess || bulkReject.isSuccess || bulkDelete.isSuccess) {
      return 'success'
    }
    if (bulkApprove.isError || bulkReject.isError || bulkDelete.isError) {
      return 'error'
    }
    return 'idle'
  }

  const closeBulkModal = (newOpen: boolean) => {
    if (getBulkActionStatus() === 'loading') {
      return
    }
    if (!newOpen) {
      setBulkModalOpen(false)
      setSelectedBulkRequests([])
      setCurrentBulkAction(null)
    }
  }

  // Close bulk modal after success with proper cleanup
  useEffect(() => {
    if (bulkApprove.isSuccess) {
      const timer = setTimeout(() => {
        setBulkModalOpen(false)
        setCurrentBulkAction(null)
        bulkApprove.reset()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [bulkApprove.isSuccess, bulkApprove])

  useEffect(() => {
    if (bulkReject.isSuccess) {
      const timer = setTimeout(() => {
        setBulkModalOpen(false)
        setCurrentBulkAction(null)
        bulkReject.reset()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [bulkReject.isSuccess, bulkReject])

  useEffect(() => {
    if (bulkDelete.isSuccess) {
      const timer = setTimeout(() => {
        setBulkModalOpen(false)
        setCurrentBulkAction(null)
        bulkDelete.reset()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [bulkDelete.isSuccess, bulkDelete])

  // Bulk action handlers using mutation hooks
  const handleBulkApprove = (requestIds: string[]) => {
    setCurrentBulkAction('approve')
    bulkApprove.mutate(
      { requestIds: requestIds.map((id) => Number.parseInt(id, 10)) },
      {
        onSuccess: (data) => {
          toast.success(`Approved ${data.result.successful} requests`)
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to approve requests',
          )
          setCurrentBulkAction(null)
        },
      },
    )
  }

  const handleBulkReject = (requestIds: string[]) => {
    setCurrentBulkAction('reject')
    bulkReject.mutate(
      { requestIds: requestIds.map((id) => Number.parseInt(id, 10)) },
      {
        onSuccess: (data) => {
          toast.success(`Rejected ${data.result.successful} requests`)
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to reject requests',
          )
          setCurrentBulkAction(null)
        },
      },
    )
  }

  const handleBulkDelete = (requestIds: string[]) => {
    setCurrentBulkAction('delete')
    bulkDelete.mutate(
      { requestIds: requestIds.map((id) => Number.parseInt(id, 10)) },
      {
        onSuccess: (data) => {
          toast.success(`Deleted ${data.result.successful} requests`)
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to delete requests',
          )
          setCurrentBulkAction(null)
        },
      },
    )
  }

  // Loading state
  const isLoading = approvalsLoading || statsLoading
  const approvalRequests = approvalsData?.approvalRequests ?? []
  const stats = statsData?.stats ?? null

  if (isLoading && approvalRequests.length === 0) {
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
      {approvalsError && (
        <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-md p-4">
          <div className="flex justify-between items-center">
            <p className="text-red-800 dark:text-red-200">
              {approvalsError instanceof Error
                ? approvalsError.message
                : 'Failed to load approvals'}
            </p>
            <Button
              variant="error"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: approvalKeys.all })
              }
            >
              Retry
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
      <ApprovalStatsHeader stats={stats} loading={statsLoading} />

      {/* Configuration section */}
      <ApprovalConfigurationSection />

      {/* Approval requests table */}
      <ApprovalTable
        data={approvalRequests}
        total={approvalsData?.total ?? 0}
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
      />

      {/* View details modal */}
      {selectedRequest && (
        <ApprovalActionsModal
          request={selectedRequest}
          open={viewModalOpen}
          onOpenChange={closeViewModal}
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
        actionStatus={getBulkActionStatus()}
        currentAction={currentBulkAction}
      />
    </div>
  )
}
