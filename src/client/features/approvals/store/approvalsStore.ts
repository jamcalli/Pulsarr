import type {
  ApprovalRequestResponse,
  ApprovalStatsResponse,
  GetApprovalRequestsQuery,
  UpdateApprovalRequest,
} from '@root/schemas/approval/approval.schema'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface ApprovalsState {
  // Data
  approvalRequests: ApprovalRequestResponse[]
  stats: ApprovalStatsResponse['stats'] | null

  // State management
  isInitialized: boolean
  isInitializing: boolean
  approvalsLoading: boolean
  statsLoading: boolean
  error: string | null

  // Pagination and filtering
  currentQuery: GetApprovalRequestsQuery
  total: number
  hasMore: boolean

  // Loading management (following Sonarr/Radarr pattern)
  isLoadingRef: boolean
  isInitialMount: boolean

  // Actions
  initialize: (force?: boolean) => Promise<void>
  setLoadingWithMinDuration: (loading: boolean) => void

  // Approval request operations
  fetchApprovalRequests: (
    query?: Partial<GetApprovalRequestsQuery>,
  ) => Promise<void>
  refreshApprovalRequests: () => Promise<void>
  updateApprovalRequest: (
    id: number,
    updates: UpdateApprovalRequest,
  ) => Promise<void>
  deleteApprovalRequest: (id: number) => Promise<void>
  approveRequest: (id: number, notes?: string) => Promise<void>
  rejectRequest: (id: number, reason?: string) => Promise<void>

  // Stats operations
  fetchStats: () => Promise<void>

  // Utility actions
  setQuery: (query: Partial<GetApprovalRequestsQuery>) => void
  clearError: () => void

  // SSE event handlers
  handleApprovalCreated: (request: ApprovalRequestResponse) => void
  handleApprovalUpdated: (request: ApprovalRequestResponse) => void
  handleApprovalDeleted: (requestId: number) => void
}

export const useApprovalsStore = create<ApprovalsState>()(
  devtools((set, get) => ({
    // Initial state
    approvalRequests: [],
    stats: null,
    isInitialized: false,
    isInitializing: false,
    approvalsLoading: false,
    statsLoading: false,
    error: null,
    currentQuery: {
      limit: 1000, // Fetch all records for self-hosted app
      offset: 0,
    },
    total: 0,
    hasMore: false,
    isLoadingRef: false,
    isInitialMount: true,

    // Loading management (following Sonarr/Radarr pattern)
    setLoadingWithMinDuration: (loading) => {
      const state = get()
      if (loading && !state.isInitialMount && !state.isLoadingRef) {
        return
      }

      if (loading) {
        if (!state.isLoadingRef) {
          set({
            isLoadingRef: true,
            approvalsLoading: true,
          })
        }
      } else {
        setTimeout(() => {
          set({
            approvalsLoading: false,
            isLoadingRef: false,
            isInitialMount: false,
          })
        }, 500)
      }
    },

    initialize: async (force = false) => {
      const state = get()
      if ((!state.isInitialized || force) && !state.isInitializing) {
        set({ isInitializing: true })

        if (state.isInitialMount) {
          state.setLoadingWithMinDuration(true)
        }

        try {
          await Promise.all([state.fetchApprovalRequests(), state.fetchStats()])

          set({
            isInitialized: true,
            isInitializing: false,
            error: null,
          })
        } catch (error) {
          set({
            error: 'Failed to initialize approvals',
            isInitialized: false,
            isInitializing: false,
          })
          console.error('Approvals initialization error:', error)
        } finally {
          if (state.isInitialMount) {
            state.setLoadingWithMinDuration(false)
          }
        }
      }
    },

    fetchApprovalRequests: async (queryUpdates = {}) => {
      const state = get()
      try {
        const query = { ...state.currentQuery, ...queryUpdates }
        const queryParams = new URLSearchParams()

        // Add non-undefined query parameters
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value.toString())
          }
        }

        const response = await fetch(`/v1/approval/requests?${queryParams}`)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            errorData.message ||
              `Failed to fetch approval requests: ${response.statusText}`,
          )
        }

        const data = await response.json()

        if (data.success) {
          set({
            approvalRequests: data.approvalRequests,
            total: data.total,
            hasMore: data.offset + data.limit < data.total,
            currentQuery: query,
            error: null,
          })
        } else {
          throw new Error(data.message || 'Failed to fetch approval requests')
        }
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch approval requests',
        })
        console.error('Error fetching approval requests:', error)
        throw error
      }
    },

    refreshApprovalRequests: async () => {
      const state = get()
      await state.fetchApprovalRequests(state.currentQuery)
    },

    updateApprovalRequest: async (
      id: number,
      updates: UpdateApprovalRequest,
    ) => {
      try {
        const response = await fetch(`/v1/approval/requests/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.message || 'Failed to update approval request',
          )
        }

        const data = await response.json()

        if (data.success) {
          // Update local state
          set((state) => ({
            approvalRequests: state.approvalRequests.map((request) =>
              request.id === id ? data.approvalRequest : request,
            ),
          }))

          // Refresh stats if status changed
          if (updates.status) {
            await get().fetchStats()
          }
        } else {
          throw new Error(data.message || 'Failed to update approval request')
        }
      } catch (error) {
        console.error('Failed to update approval request:', error)
        throw error
      }
    },

    deleteApprovalRequest: async (id: number) => {
      try {
        const response = await fetch(`/v1/approval/requests/${id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.message || 'Failed to delete approval request',
          )
        }

        // Remove from local state
        set((state) => ({
          approvalRequests: state.approvalRequests.filter(
            (request) => request.id !== id,
          ),
          total: state.total - 1,
        }))

        // Refresh stats
        await get().fetchStats()
      } catch (error) {
        console.error('Failed to delete approval request:', error)
        throw error
      }
    },

    approveRequest: async (id: number, notes?: string) => {
      try {
        const response = await fetch(`/v1/approval/requests/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to approve request')
        }

        // Refresh the requests and stats
        await Promise.all([get().refreshApprovalRequests(), get().fetchStats()])
      } catch (error) {
        console.error('Failed to approve request:', error)
        throw error
      }
    },

    rejectRequest: async (id: number, reason?: string) => {
      try {
        const response = await fetch(`/v1/approval/requests/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to reject request')
        }

        // Refresh the requests and stats
        await Promise.all([get().refreshApprovalRequests(), get().fetchStats()])
      } catch (error) {
        console.error('Failed to reject request:', error)
        throw error
      }
    },

    fetchStats: async () => {
      try {
        set({ statsLoading: true })

        const response = await fetch('/v1/approval/stats')

        if (!response.ok) {
          throw new Error(
            `Failed to fetch approval stats: ${response.statusText}`,
          )
        }

        const data = await response.json()

        if (data.success) {
          set({ stats: data.stats, error: null })
        } else {
          throw new Error(data.message || 'Failed to fetch approval stats')
        }
      } catch (error) {
        set({ error: 'Failed to fetch approval stats' })
        console.error('Error fetching approval stats:', error)
        throw error
      } finally {
        set({ statsLoading: false })
      }
    },

    setQuery: (queryUpdates: Partial<GetApprovalRequestsQuery>) => {
      set((state) => ({
        currentQuery: { ...state.currentQuery, ...queryUpdates, offset: 0 },
      }))
    },

    clearError: () => {
      set({ error: null })
    },

    // SSE event handlers
    handleApprovalCreated: (request: ApprovalRequestResponse) => {
      set((state) => {
        // Insert new request at the beginning (most recent first)
        // Check if it already exists to prevent duplicates
        const exists = state.approvalRequests.some((r) => r.id === request.id)
        if (exists) return state

        return {
          approvalRequests: [request, ...state.approvalRequests],
          total: state.total + 1,
        }
      })
      // Refresh stats to maintain consistency
      get().fetchStats()
    },

    handleApprovalUpdated: (request: ApprovalRequestResponse) => {
      set((state) => {
        const index = state.approvalRequests.findIndex(
          (r) => r.id === request.id,
        )
        if (index === -1) {
          // Request not in current list, check if it should be added based on current filters
          // For now, just ignore unknown requests to avoid complexity
          return state
        }

        // Update the existing request
        const updatedRequests = [...state.approvalRequests]
        updatedRequests[index] = request

        return {
          approvalRequests: updatedRequests,
        }
      })
      // Refresh stats if status might have changed
      get().fetchStats()
    },

    handleApprovalDeleted: (requestId: number) => {
      set((state) => {
        const filteredRequests = state.approvalRequests.filter(
          (r) => r.id !== requestId,
        )

        // Only update if we actually removed something
        if (filteredRequests.length === state.approvalRequests.length) {
          return state
        }

        return {
          approvalRequests: filteredRequests,
          total: Math.max(0, state.total - 1),
        }
      })
      // Refresh stats after deletion
      get().fetchStats()
    },
  })),
)
