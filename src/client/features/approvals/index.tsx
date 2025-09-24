import type {
  ApprovalRequestResponse,
  BulkApprovalRequest,
  BulkDeleteRequest,
  BulkRejectRequest,
} from '@root/schemas/approval/approval.schema'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import ApprovalActionsModal from '@/features/approvals/components/approval-actions-modal'
import ApprovalStatsHeader from '@/features/approvals/components/approval-stats-header'
import {
  ApprovalTable,
  type ApprovalTableRef,
} from '@/features/approvals/components/approval-table'
import BulkApprovalModal from '@/features/approvals/components/bulk-approval-modal'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import { useApprovalPageEvents } from '@/hooks/useApprovalEvents'
import { useConfigStore } from '@/stores/configStore'

type BulkActionStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Renders the Approvals page, enabling real-time management of approval requests with features such as filtering, sorting, pagination, and both individual and bulk actions (approve, reject, delete).
 *
 * Integrates with real-time updates, manages loading and error states, and provides modals for detailed individual and bulk operations. Handles state for selected requests and action statuses.
 *
 * @returns The React element representing the Approvals page.
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
  const tableRef = useRef<ApprovalTableRef>(null)
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
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setMinLoadingComplete(true)
        if (isInitialized) {
          setIsLoading(false)
        }
      }
    }, MIN_LOADING_DELAY)

    return () => {
      isMounted = false
      clearTimeout(timeoutId)
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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      const response = await fetch('/v1/approval/requests/bulk/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error('Bulk approval failed')

      setBulkActionStatus('success')
      toast.success(`Approved ${data.requestIds.length} requests`)

      // Refresh data
      await Promise.all([refreshApprovalRequests(), fetchStats()])

      // Clear table selection
      tableRef.current?.clearSelection()

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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      const response = await fetch('/v1/approval/requests/bulk/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error('Bulk rejection failed')

      setBulkActionStatus('success')
      toast.success(`Rejected ${data.requestIds.length} requests`)

      // Refresh data
      await Promise.all([refreshApprovalRequests(), fetchStats()])

      // Clear table selection
      tableRef.current?.clearSelection()

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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      const response = await fetch('/v1/approval/requests/bulk/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error('Bulk deletion failed')

      setBulkActionStatus('success')
      toast.success(`Deleted ${data.requestIds.length} requests`)

      // Refresh data
      await Promise.all([refreshApprovalRequests(), fetchStats()])

      // Clear table selection
      tableRef.current?.clearSelection()

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
          ref={tableRef}
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
