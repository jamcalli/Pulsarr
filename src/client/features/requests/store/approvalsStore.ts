import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import type { ApprovalStatus } from '@root/types/approval.types'
import { z } from 'zod'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { type PrefDef, readPref, writePref } from '@/lib/prefs'

/**
 * Filter state for approval requests.
 * These filters are sent to the server for server-side filtering.
 */
interface ApprovalFilters {
  status: ApprovalStatus[]
  userId: number[]
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
 * Sortable column IDs for approval requests.
 */
type ApprovalSortBy =
  | 'contentTitle'
  | 'userName'
  | 'status'
  | 'triggeredBy'
  | 'createdAt'
  | 'expiresAt'

type SortOrder = 'asc' | 'desc'

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

  // Server-side sorting
  sortBy: ApprovalSortBy
  sortOrder: SortOrder
  setSorting: (sortBy: ApprovalSortBy, sortOrder: SortOrder) => void

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
  userId: [],
  contentType: [],
  triggeredBy: [],
  search: '',
}

const DEFAULT_PAGE_SIZE = 20

const persistedPrefsSchema = z.object({
  filters: z
    .object({
      status: z
        .array(
          z.enum([
            'pending',
            'approved',
            'rejected',
            'expired',
            'auto_approved',
          ]),
        )
        .catch([]),
      userId: z.array(z.number()).catch([]),
      contentType: z.array(z.enum(['movie', 'show'])).catch([]),
      triggeredBy: z
        .array(
          z.enum([
            'quota_exceeded',
            'router_rule',
            'manual_flag',
            'content_criteria',
          ]),
        )
        .catch([]),
      search: z.string().catch(''),
    })
    .catch(DEFAULT_FILTERS),
  pageSize: z.number().int().min(1).max(100).catch(DEFAULT_PAGE_SIZE),
  sortBy: z
    .enum([
      'contentTitle',
      'userName',
      'status',
      'triggeredBy',
      'createdAt',
      'expiresAt',
    ])
    .catch('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).catch('desc'),
})

type PersistedApprovalsPrefs = z.infer<typeof persistedPrefsSchema>

const approvalsPrefsDef: PrefDef<PersistedApprovalsPrefs> = {
  key: 'pulsarr-approvals-store',
  fallback: {
    filters: DEFAULT_FILTERS,
    pageSize: DEFAULT_PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  parse: (raw) => {
    try {
      const parsed = JSON.parse(raw)
      // Values written by the old zustand persist middleware are wrapped
      // in { state, version }
      const source =
        typeof parsed === 'object' && parsed !== null && 'state' in parsed
          ? parsed.state
          : parsed
      const result = persistedPrefsSchema.safeParse(source)
      return result.success ? result.data : undefined
    } catch {
      return undefined
    }
  },
  serialize: JSON.stringify,
}

const initialPrefs = readPref(approvalsPrefsDef)

export const useApprovalsStore = create<ApprovalsUIState>()(
  devtools((set) => {
    const persistPrefs = (state: {
      filters: ApprovalFilters
      pageSize: number
      sortBy: ApprovalSortBy
      sortOrder: SortOrder
    }) => {
      writePref(approvalsPrefsDef, {
        filters: state.filters,
        pageSize: state.pageSize,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      })
    }

    return {
      // Server-side filters
      filters: initialPrefs.filters,
      setFilters: (newFilters) =>
        set((state) => {
          const filters = { ...state.filters, ...newFilters }
          persistPrefs({ ...state, filters })
          // Reset to first page when filters change
          return { filters, pageIndex: 0 }
        }),
      resetFilters: () =>
        set((state) => {
          persistPrefs({ ...state, filters: DEFAULT_FILTERS })
          return { filters: DEFAULT_FILTERS, pageIndex: 0 }
        }),

      // Server-side pagination
      pageIndex: 0,
      pageSize: initialPrefs.pageSize,
      setPageIndex: (index) => set({ pageIndex: index }),
      setPageSize: (size) =>
        set((state) => {
          persistPrefs({ ...state, pageSize: size })
          return { pageSize: size, pageIndex: 0 }
        }),

      // Server-side sorting
      sortBy: initialPrefs.sortBy,
      sortOrder: initialPrefs.sortOrder,
      setSorting: (sortBy, sortOrder) =>
        set((state) => {
          persistPrefs({ ...state, sortBy, sortOrder })
          return { sortBy, sortOrder }
        }),

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
    }
  }),
)
