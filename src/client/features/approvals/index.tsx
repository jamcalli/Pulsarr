import { useEffect, useRef, useState, useCallback } from 'react'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'
import { useConfigStore } from '@/stores/configStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useApprovalPageEvents } from '@/hooks/useApprovalEvents'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { ApprovalTable } from '@/features/approvals/components/approval-table'
import ApprovalStatsHeader from '@/features/approvals/components/approval-stats-header'
import ApprovalActionsModal from '@/features/approvals/components/approval-actions-modal'
import BulkApprovalModal from '@/features/approvals/components/bulk-approval-modal'
import type {
  ApprovalRequestResponse,
  BulkApprovalRequest,
  BulkRejectRequest,
  BulkDeleteRequest,
} from '@root/schemas/approval/approval.schema'

type BulkActionStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Displays the Approvals page, providing real-time management of approval requests with filtering, sorting, pagination, and both individual and bulk actions.
 *
 * Integrates with real-time updates and handles loading and error states. Supports modals for detailed individual and bulk operations, and manages state for selections and action statuses.
 *
 * @returns The rendered Approvals page React element.
 */
export default function ApprovalsPage() {
  const configInitialize = useConfigStore((state) => state.initialize)

  const {
    approvalRequests,
    stats,
    isInitialized,
    approvalsLoading,
    error,
    initialize,
    refreshApprovalRequests,
    handleApprovalDeleted,
    fetchStats,
  } = useApprovalsStore()

  const hasInitializedRef = useRef(false)
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequestResponse | null>(null)
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [selectedRequests, setSelectedRequests] = useState<
    ApprovalRequestResponse[]
  >([])
  const [bulkActionStatus, setBulkActionStatus] =
    useState<BulkActionStatus>('idle')
  const [bulkActionType, setBulkActionType] = useState<
    'approve' | 'reject' | 'delete' | null
  >(null)

  // Loading state management with minimum delay
  const [isLoading, setIsLoading] = useState(true)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)

  // Real-time events - connect SSE events to store updates
  useApprovalPageEvents({
    onApprovalCreated: (_event, _metadata) => {
      refreshApprovalRequests()
      fetchStats()
    },
    onApprovalUpdated: (_event, _metadata) => {
      refreshApprovalRequests()
      fetchStats()
    },
    onApprovalApproved: (_event, _metadata) => {
      refreshApprovalRequests()
      fetchStats()
    },
    onApprovalRejected: (_event, _metadata) => {
      refreshApprovalRequests()
      fetchStats()
    },
    onApprovalDeleted: (_event, metadata) => {
      handleApprovalDeleted(metadata.requestId)
      fetchStats()
    },
  })

  const retryInitialization = useCallback(() => {
    console.log('🔄 Retrying approvals initialization...')
    initialize()
  }, [initialize])

  // Setup minimum loading time
  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(() => {
      if (isMounted) {
        setMinLoadingComplete(true)
        if (isInitialized) {
          setIsLoading(false)
        }
      }
    }, MIN_LOADING_DELAY)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [isInitialized])

  // Update loading state when initialized
  useEffect(() => {
    if (isInitialized && minLoadingComplete) {
      setIsLoading(false)
    }
  }, [isInitialized, minLoadingComplete])

  // Initialize stores on mount
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      console.log('🚀 Initializing stores...')
      configInitialize() // Initialize config store for user data
      initialize() // Initialize approvals store
    }
  }, [initialize, configInitialize])

  // Handle individual approval actions
  const handleIndividualAction = (request: ApprovalRequestResponse) => {
    setSelectedRequest(request)
    setIsActionsModalOpen(true)
  }

  // Handle bulk actions
  const handleBulkAction = (
    requests: ApprovalRequestResponse[],
    action: 'approve' | 'reject' | 'delete',
  ) => {
    setSelectedRequests(requests)
    setBulkActionType(action)
    setIsBulkModalOpen(true)
    setBulkActionStatus('idle')
  }

  // Execute bulk approval
  const executeBulkApproval = async (data: BulkApprovalRequest) => {
    setBulkActionStatus('loading')
    try {
      const response = await fetch('/v1/approval/requests/bulk/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Bulk approval failed')

      setBulkActionStatus('success')
      toast.success(`Approved ${data.requestIds.length} requests`)

      // Refresh data
      await Promise.all([refreshApprovalRequests(), fetchStats()])

      // Close modal after short delay
      setTimeout(() => setIsBulkModalOpen(false), 1000)
    } catch (error) {
      setBulkActionStatus('error')
      toast.error('Failed to approve requests')
      console.error('Bulk approval error:', error)
    }
  }

  // Execute bulk rejection
  const executeBulkReject = async (data: BulkRejectRequest) => {
    setBulkActionStatus('loading')
    try {
      const response = await fetch('/v1/approval/requests/bulk/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Bulk rejection failed')

      setBulkActionStatus('success')
      toast.success(`Rejected ${data.requestIds.length} requests`)

      // Refresh data
      await Promise.all([refreshApprovalRequests(), fetchStats()])

      // Close modal after short delay
      setTimeout(() => setIsBulkModalOpen(false), 1000)
    } catch (error) {
      setBulkActionStatus('error')
      toast.error('Failed to reject requests')
      console.error('Bulk rejection error:', error)
    }
  }

  // Execute bulk deletion
  const executeBulkDelete = async (data: BulkDeleteRequest) => {
    setBulkActionStatus('loading')
    try {
      const response = await fetch('/v1/approval/requests/bulk/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Bulk deletion failed')

      setBulkActionStatus('success')
      toast.success(`Deleted ${data.requestIds.length} requests`)

      // Refresh data
      await Promise.all([refreshApprovalRequests(), fetchStats()])

      // Close modal after short delay
      setTimeout(() => setIsBulkModalOpen(false), 1000)
    } catch (error) {
      setBulkActionStatus('error')
      toast.error('Failed to delete requests')
      console.error('Bulk deletion error:', error)
    }
  }

  // Show error state
  if (error && !isLoading) {
    return (
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={retryInitialization} variant="default">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // Show loading state - let components handle their own loading
  if (isLoading) {
    return (
      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-foreground">Approvals</h2>
        </div>
        <div className="grid gap-4">
          {/* Stats Header with loading state */}
          <ApprovalStatsHeader stats={null} loading={true} />

          {/* Approval Table with loading state */}
          <ApprovalTable
            data={[]}
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
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-foreground">Approvals</h2>
      </div>
      <div className="grid gap-4">
        {/* Stats Header */}
        <ApprovalStatsHeader stats={stats} />

        {/* Approval Table */}
        <ApprovalTable
          data={approvalRequests || []}
          onApprove={(request) => handleIndividualAction(request)}
          onReject={(request) => handleIndividualAction(request)}
          onView={(request) => handleIndividualAction(request)}
          onDelete={(request) => handleIndividualAction(request)}
          onBulkActions={(requests) => handleBulkAction(requests, 'approve')}
          isLoading={approvalsLoading}
        />

        {/* Individual Actions Modal */}
        {selectedRequest && (
          <ApprovalActionsModal
            open={isActionsModalOpen}
            onOpenChange={setIsActionsModalOpen}
            request={selectedRequest}
            onUpdate={async () => {
              await refreshApprovalRequests()
              await fetchStats()
            }}
          />
        )}

        {/* Bulk Actions Modal */}
        <BulkApprovalModal
          open={isBulkModalOpen}
          onOpenChange={setIsBulkModalOpen}
          selectedRequests={selectedRequests}
          onBulkApprove={(requestIds) =>
            executeBulkApproval({
              requestIds: requestIds.map((id) => Number.parseInt(id, 10)),
            })
          }
          onBulkReject={(requestIds) =>
            executeBulkReject({
              requestIds: requestIds.map((id) => Number.parseInt(id, 10)),
            })
          }
          onBulkDelete={(requestIds) =>
            executeBulkDelete({
              requestIds: requestIds.map((id) => Number.parseInt(id, 10)),
            })
          }
          actionStatus={bulkActionStatus}
          currentAction={bulkActionType}
        />
      </div>
    </div>
  )
}
