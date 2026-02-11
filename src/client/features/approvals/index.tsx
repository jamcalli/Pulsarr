import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import ApprovalActionsModal from '@/features/approvals/components/approval-actions-modal'
import ApprovalStatsHeader from '@/features/approvals/components/approval-stats-header'
import {
  ApprovalTable,
  type ApprovalTableRef,
} from '@/features/approvals/components/approval-table'
import BulkApprovalModal from '@/features/approvals/components/bulk-approval-modal'
import {
  useBulkApprove,
  useBulkDelete,
  useBulkReject,
} from '@/features/approvals/hooks/useApprovalMutations'
import { useApprovalStats } from '@/features/approvals/hooks/useApprovalStats'
import { useApprovals } from '@/features/approvals/hooks/useApprovals'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'
import { useApprovalPageEvents } from '@/hooks/useApprovalEvents'
import { queryClient } from '@/lib/queryClient'
import { useConfigStore } from '@/stores/configStore'
import { approvalStatsKeys } from './hooks/useApprovalStats'
import { approvalKeys } from './hooks/useApprovals'

/**
 * Renders the Approvals page with real-time management of approval requests.
 *
 * Uses React Query for data fetching and caching, with SSE for real-time updates.
 * Modal and selection state managed via Zustand store.
 */
export default function ApprovalsPage() {
  const configInitialize = useConfigStore((state) => state.initialize)
  const isConfigInitialized = useConfigStore((state) => state.isInitialized)

  // Query hooks for data
  const {
    data: approvalsData,
    isLoading: approvalsLoading,
    error: approvalsError,
  } = useApprovals()
  const { data: statsData, isLoading: statsLoading } = useApprovalStats()

  // Mutation hooks for bulk actions
  const bulkApprove = useBulkApprove()
  const bulkReject = useBulkReject()
  const bulkDelete = useBulkDelete()

  // UI state from store
  const {
    selectedRequest,
    isActionsModalOpen,
    setActionsModalOpen,
    openActionsModal,
    isBulkModalOpen,
    setBulkModalOpen,
    selectedRequests,
    bulkActionType,
    openBulkModal,
    closeBulkModal,
  } = useApprovalsStore(
    useShallow((state) => ({
      selectedRequest: state.selectedRequest,
      isActionsModalOpen: state.isActionsModalOpen,
      setActionsModalOpen: state.setActionsModalOpen,
      openActionsModal: state.openActionsModal,
      isBulkModalOpen: state.isBulkModalOpen,
      setBulkModalOpen: state.setBulkModalOpen,
      selectedRequests: state.selectedRequests,
      bulkActionType: state.bulkActionType,
      openBulkModal: state.openBulkModal,
      closeBulkModal: state.closeBulkModal,
    })),
  )

  const tableRef = useRef<ApprovalTableRef>(null)
  const hasInitializedRef = useRef(false)

  // Initialize config store on mount
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      configInitialize()
    }
  }, [configInitialize])

  // Real-time events - invalidate React Query cache on SSE events
  const invalidateApprovalQueries = () => {
    queryClient.invalidateQueries({ queryKey: approvalKeys.all })
    queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
  }

  useApprovalPageEvents({
    onApprovalCreated: invalidateApprovalQueries,
    onApprovalUpdated: invalidateApprovalQueries,
    onApprovalApproved: invalidateApprovalQueries,
    onApprovalRejected: invalidateApprovalQueries,
    onApprovalDeleted: invalidateApprovalQueries,
  })

  // Bulk action handlers
  const executeBulkApproval = (requestIds: string[]) => {
    bulkApprove.mutate(
      { requestIds: requestIds.map((id) => Number.parseInt(id, 10)) },
      {
        onSuccess: (data) => {
          toast.success(`Approved ${data.result.successful} requests`)
          tableRef.current?.clearSelection()
          setTimeout(() => {
            closeBulkModal()
            bulkApprove.reset()
          }, 1000)
        },
        onError: () => {
          toast.error('Failed to approve requests')
        },
      },
    )
  }

  const executeBulkReject = (requestIds: string[]) => {
    bulkReject.mutate(
      { requestIds: requestIds.map((id) => Number.parseInt(id, 10)) },
      {
        onSuccess: (data) => {
          toast.success(`Rejected ${data.result.successful} requests`)
          tableRef.current?.clearSelection()
          setTimeout(() => {
            closeBulkModal()
            bulkReject.reset()
          }, 1000)
        },
        onError: () => {
          toast.error('Failed to reject requests')
        },
      },
    )
  }

  const executeBulkDelete = (requestIds: string[]) => {
    bulkDelete.mutate(
      { requestIds: requestIds.map((id) => Number.parseInt(id, 10)) },
      {
        onSuccess: (data) => {
          toast.success(`Deleted ${data.result.successful} requests`)
          tableRef.current?.clearSelection()
          setTimeout(() => {
            closeBulkModal()
            bulkDelete.reset()
          }, 1000)
        },
        onError: () => {
          toast.error('Failed to delete requests')
        },
      },
    )
  }

  // Determine bulk action status for modal
  const getBulkActionStatus = () => {
    if (bulkApprove.isPending || bulkReject.isPending || bulkDelete.isPending) {
      return 'loading' as const
    }
    if (bulkApprove.isSuccess || bulkReject.isSuccess || bulkDelete.isSuccess) {
      return 'success' as const
    }
    if (bulkApprove.isError || bulkReject.isError || bulkDelete.isError) {
      return 'error' as const
    }
    return 'idle' as const
  }

  // Combined loading state
  const isLoading = !isConfigInitialized || approvalsLoading || statsLoading

  // Show error state
  if (approvalsError && !isLoading) {
    const errorMessage =
      approvalsError instanceof Error
        ? approvalsError.message
        : 'Failed to load approvals'
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-foreground">Approvals</h2>
        </div>
        <div className="flex justify-center items-center h-24 text-red-500">
          <AlertTriangle className="h-6 w-6 mr-2" />
          <span>{errorMessage}</span>
        </div>
      </div>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-foreground">Approvals</h2>
        </div>
        <div className="grid gap-4">
          <ApprovalStatsHeader stats={null} loading={true} />
          <ApprovalTable
            data={[]}
            total={0}
            onApprove={() => {}}
            onReject={() => {}}
            onView={() => {}}
            onDelete={() => {}}
            onBulkActions={() => {}}
            isLoading={true}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-foreground">Approvals</h2>
      </div>
      <div className="grid gap-4">
        {/* Stats Header */}
        <ApprovalStatsHeader stats={statsData?.stats ?? null} />

        {/* Approval Table */}
        <ApprovalTable
          ref={tableRef}
          data={approvalsData?.approvalRequests ?? []}
          total={approvalsData?.total ?? 0}
          onApprove={openActionsModal}
          onReject={openActionsModal}
          onView={openActionsModal}
          onDelete={openActionsModal}
          onBulkActions={(requests) => openBulkModal(requests, 'approve')}
          isLoading={approvalsLoading}
        />

        {/* Individual Actions Modal */}
        {selectedRequest && (
          <ApprovalActionsModal
            open={isActionsModalOpen}
            onOpenChange={setActionsModalOpen}
            request={selectedRequest}
          />
        )}

        {/* Bulk Actions Modal */}
        <BulkApprovalModal
          open={isBulkModalOpen}
          onOpenChange={setBulkModalOpen}
          selectedRequests={selectedRequests}
          onBulkApprove={executeBulkApproval}
          onBulkReject={executeBulkReject}
          onBulkDelete={executeBulkDelete}
          actionStatus={getBulkActionStatus()}
          currentAction={bulkActionType}
        />
      </div>
    </div>
  )
}
