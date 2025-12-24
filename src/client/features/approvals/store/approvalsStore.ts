import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

/**
 * Approval status type for filter UI (matches backend schema)
 */
type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'auto_approved'

/**
 * Filter state for approval requests.
 * These filters are sent to the server for server-side filtering.
 */
interface ApprovalFilters {
  status: ApprovalStatus[]
  contentType: ('movie' | 'show')[]
  triggeredBy: (
    | 'quota_exceeded'
    | 'router_rule'
    | 'manual_flag'
    | 'content_criteria'
  )[]
  search: string
}

/**
 * UI-only state for the approvals feature.
 *
 * Data fetching is handled by React Query hooks (useApprovals, useApprovalStats).
 * This store only holds UI state: filters, pagination, selections, and modal visibility.
 */
interface ApprovalsUIState {
  // Server-side filters
  filters: ApprovalFilters
  setFilters: (filters: Partial<ApprovalFilters>) => void
  resetFilters: () => void

  // Server-side pagination
  pageIndex: number
  pageSize: number
  setPageIndex: (index: number) => void
  setPageSize: (size: number) => void

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

const DEFAULT_FILTERS: ApprovalFilters = {
  status: [],
  contentType: [],
  triggeredBy: [],
  search: '',
}

const DEFAULT_PAGE_SIZE = 20

export const useApprovalsStore = create<ApprovalsUIState>()(
  devtools(
    persist(
      (set) => ({
        // Server-side filters
        filters: DEFAULT_FILTERS,
        setFilters: (newFilters) =>
          set((state) => ({
            filters: { ...state.filters, ...newFilters },
            pageIndex: 0, // Reset to first page when filters change
          })),
        resetFilters: () =>
          set({
            filters: DEFAULT_FILTERS,
            pageIndex: 0,
          }),

        // Server-side pagination
        pageIndex: 0,
        pageSize: DEFAULT_PAGE_SIZE,
        setPageIndex: (index) => set({ pageIndex: index }),
        setPageSize: (size) => set({ pageSize: size, pageIndex: 0 }),

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
      }),
      {
        name: 'pulsarr-approvals-store',
        partialize: (state) => ({
          filters: state.filters,
          pageSize: state.pageSize,
        }),
      },
    ),
  ),
)
