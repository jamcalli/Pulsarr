import type {
  ApprovalRequestResponse,
  GetApprovalRequestsQuery,
} from '@root/schemas/approval/approval.schema'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * UI-only state for the approvals feature.
 *
 * Data fetching is handled by React Query hooks (useApprovals, useApprovalStats).
 * This store only holds UI state: filters, selections, and modal visibility.
 */
interface ApprovalsUIState {
  // Query filters - displayed in filter UI, used by useApprovals hook
  currentQuery: Partial<GetApprovalRequestsQuery>
  setQuery: (query: Partial<GetApprovalRequestsQuery>) => void
  resetQuery: () => void

  // Individual action modal state
  selectedRequest: ApprovalRequestResponse | null
  setSelectedRequest: (request: ApprovalRequestResponse | null) => void
  isActionsModalOpen: boolean
  setActionsModalOpen: (open: boolean) => void

  // Bulk action modal state
  isBulkModalOpen: boolean
  setBulkModalOpen: (open: boolean) => void
  selectedRequests: ApprovalRequestResponse[]
  setSelectedRequests: (requests: ApprovalRequestResponse[]) => void
  bulkActionType: 'approve' | 'reject' | 'delete' | null
  setBulkActionType: (type: 'approve' | 'reject' | 'delete' | null) => void

  // Convenience action to open individual modal
  openActionsModal: (request: ApprovalRequestResponse) => void
  closeActionsModal: () => void

  // Convenience action to open bulk modal
  openBulkModal: (
    requests: ApprovalRequestResponse[],
    action: 'approve' | 'reject' | 'delete',
  ) => void
  closeBulkModal: () => void
}

const DEFAULT_QUERY: Partial<GetApprovalRequestsQuery> = {
  limit: 50000,
  offset: 0,
}

export const useApprovalsStore = create<ApprovalsUIState>()(
  devtools((set) => ({
    // Query filters
    currentQuery: DEFAULT_QUERY,
    setQuery: (query) =>
      set((state) => ({
        currentQuery: { ...state.currentQuery, ...query },
      })),
    resetQuery: () => set({ currentQuery: DEFAULT_QUERY }),

    // Individual action modal
    selectedRequest: null,
    setSelectedRequest: (request) => set({ selectedRequest: request }),
    isActionsModalOpen: false,
    setActionsModalOpen: (open) => set({ isActionsModalOpen: open }),

    // Bulk action modal
    isBulkModalOpen: false,
    setBulkModalOpen: (open) => set({ isBulkModalOpen: open }),
    selectedRequests: [],
    setSelectedRequests: (requests) => set({ selectedRequests: requests }),
    bulkActionType: null,
    setBulkActionType: (type) => set({ bulkActionType: type }),

    // Convenience: open individual modal
    openActionsModal: (request) =>
      set({
        selectedRequest: request,
        isActionsModalOpen: true,
      }),
    closeActionsModal: () =>
      set({
        isActionsModalOpen: false,
        selectedRequest: null,
      }),

    // Convenience: open bulk modal
    openBulkModal: (requests, action) =>
      set({
        selectedRequests: requests,
        bulkActionType: action,
        isBulkModalOpen: true,
      }),
    closeBulkModal: () =>
      set({
        isBulkModalOpen: false,
        selectedRequests: [],
        bulkActionType: null,
      }),
  })),
)
