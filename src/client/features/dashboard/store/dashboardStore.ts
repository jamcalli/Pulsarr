import type {
  ActivityStats,
  AvailabilityTime,
  ContentStat,
  ContentTypeDistribution,
  DashboardStats,
  GenreStat,
  GrabbedToNotifiedTime,
  InstanceStat,
  NotificationStats,
  StatusDistribution,
  StatusFlowData,
  StatusTransitionTime,
  UserStat,
} from '@root/schemas/stats/stats.schema'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api } from '@/lib/api'

// Cache management for dashboard stats
// - Prevents duplicate API calls within CACHE_DURATION window
// - Scoped to all dashboard statistics as a single unit
// - Parameter-aware: different limit/days combinations bypass cache
// - Reset by refreshAllStats for manual refresh scenarios
let lastAllStatsFetch = 0
let lastParamsKey = ''
let isRefreshing = false // Prevents race conditions during manual refresh
const CACHE_DURATION = 5000 // 5 seconds

export interface StatsState {
  // All dashboard stats
  dashboardStats: DashboardStats | null

  // Individual stats sections that can be updated independently
  topGenres: GenreStat[] | null
  mostWatchedShows: ContentStat[] | null
  mostWatchedMovies: ContentStat[] | null
  topUsers: UserStat[] | null
  statusDistribution: StatusDistribution[] | null
  contentTypeDistribution: ContentTypeDistribution[] | null
  recentActivity: ActivityStats | null
  instanceActivity: InstanceStat[] | null
  availabilityTimes: AvailabilityTime[] | null
  grabbedToNotifiedTimes: GrabbedToNotifiedTime[] | null
  statusTransitions: StatusTransitionTime[] | null
  statusFlow: StatusFlowData[] | null
  notificationStats: NotificationStats | null
  instanceContentBreakdown: Array<{
    type: 'sonarr' | 'radarr'
    name: string
    id: number
    total_items: number
    primary_items: number
    by_status: Array<{ status: string; count: number }>
    by_content_type: Array<{ count: number; content_type: string }>
  }> | null

  // Loading and error states
  loading: {
    all: boolean
    genres: boolean
    shows: boolean
    movies: boolean
    users: boolean
    activity: boolean
    availability: boolean
    grabbedToNotified: boolean
    statusTransitions: boolean
    statusFlow: boolean
    notifications: boolean
    instanceContent: boolean
  }
  errors: {
    all: string | null
    genres: string | null
    shows: string | null
    movies: string | null
    users: string | null
    activity: string | null
    availability: string | null
    grabbedToNotified: string | null
    statusTransitions: string | null
    statusFlow: string | null
    notifications: string | null
    instanceContent: string | null
  }

  // Fetch functions
  fetchAllStats: (params?: {
    limit?: number
    days?: number
  }) => Promise<boolean>
  fetchTopGenres: (limit?: number) => Promise<boolean>
  fetchMostWatchedShows: (limit?: number) => Promise<boolean>
  fetchMostWatchedMovies: (limit?: number) => Promise<boolean>
  fetchTopUsers: (limit?: number) => Promise<boolean>
  fetchRecentActivity: (days?: number) => Promise<boolean>
  fetchAvailabilityTimes: () => Promise<boolean>
  fetchGrabbedToNotifiedTimes: () => Promise<boolean>
  fetchStatusTransitions: () => Promise<boolean>
  fetchStatusFlow: () => Promise<boolean>
  fetchNotificationStats: (days?: number) => Promise<boolean>
  fetchInstanceContentBreakdown: () => Promise<boolean>

  // Cache management
  refreshAllStats: (params?: {
    limit?: number
    days?: number
  }) => Promise<boolean>

  // Initialization
  initialize: () => Promise<void>
}

export const useDashboardStore = create<StatsState>()(
  devtools((set, get) => ({
    // Initial states
    dashboardStats: null,
    topGenres: null,
    mostWatchedShows: null,
    mostWatchedMovies: null,
    topUsers: null,
    statusDistribution: null,
    contentTypeDistribution: null,
    recentActivity: null,
    instanceActivity: null,
    availabilityTimes: null,
    grabbedToNotifiedTimes: null,
    statusTransitions: null,
    statusFlow: null,
    notificationStats: null,

    // Loading states
    loading: {
      all: false,
      genres: false,
      shows: false,
      movies: false,
      users: false,
      activity: false,
      availability: false,
      grabbedToNotified: false,
      statusTransitions: false,
      statusFlow: false,
      notifications: false,
      instanceContent: false,
    },

    // Error states
    errors: {
      all: null,
      genres: null,
      shows: null,
      movies: null,
      users: null,
      activity: null,
      availability: null,
      grabbedToNotified: null,
      statusTransitions: null,
      statusFlow: null,
      notifications: null,
      instanceContent: null,
    },

    // Fetch all dashboard stats at once with caching
    fetchAllStats: async (params = {}) => {
      // In-flight guard to prevent duplicate requests
      if (get().loading.all) {
        return false
      }

      const { limit = 10, days = 30 } = params
      const paramsKey = `${limit}|${days}`
      const now = Date.now()
      if (
        now - lastAllStatsFetch < CACHE_DURATION &&
        paramsKey === lastParamsKey
      ) {
        return false
      }
      set((state) => ({
        ...state,
        loading: { ...state.loading, all: true },
        errors: { ...state.errors, all: null },
      }))

      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          days: days.toString(),
        })

        const response = await fetch(api(`/v1/stats/all?${queryParams}`))
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard statistics')
        }

        const data: DashboardStats = await response.json()

        set((state) => ({
          ...state,
          dashboardStats: data,
          topGenres: data.top_genres,
          mostWatchedShows: data.most_watched_shows,
          mostWatchedMovies: data.most_watched_movies,
          topUsers: data.top_users,
          statusDistribution: data.status_distribution,
          contentTypeDistribution: data.content_type_distribution,
          recentActivity: data.recent_activity,
          instanceActivity: data.instance_activity,
          availabilityTimes: data.availability_times,
          grabbedToNotifiedTimes: data.grabbed_to_notified_times,
          statusTransitions: data.status_transitions || [],
          statusFlow: data.status_flow || [],
          notificationStats: data.notification_stats || null,
          instanceContentBreakdown: data.instance_content_breakdown || [],
          loading: { ...state.loading, all: false },
        }))
        // Update cache timestamp and params key only on success
        lastAllStatsFetch = Date.now()
        lastParamsKey = paramsKey
        return true
      } catch (error) {
        console.error('Error fetching all stats:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, all: false },
          errors: {
            ...state.errors,
            all: error instanceof Error ? error.message : 'Unknown error',
          },
        }))
        return false // Network call failed
      }
    },

    // Individual fetch functions redirect to centralized fetchAllStats
    fetchTopGenres: async (limit = 10) => {
      return await get().fetchAllStats({ limit })
    },

    fetchInstanceContentBreakdown: async () => {
      return await get().fetchAllStats()
    },

    fetchMostWatchedShows: async (limit = 10) => {
      return await get().fetchAllStats({ limit })
    },

    fetchMostWatchedMovies: async (limit = 10) => {
      return await get().fetchAllStats({ limit })
    },

    fetchTopUsers: async (limit = 10) => {
      return await get().fetchAllStats({ limit })
    },

    fetchRecentActivity: async (days = 30) => {
      return await get().fetchAllStats({ days })
    },

    fetchAvailabilityTimes: async () => {
      return await get().fetchAllStats()
    },

    fetchGrabbedToNotifiedTimes: async () => {
      return await get().fetchAllStats()
    },

    fetchStatusTransitions: async () => {
      return await get().fetchAllStats()
    },

    fetchStatusFlow: async () => {
      return await get().fetchAllStats()
    },

    fetchNotificationStats: async (days = 30) => {
      return await get().fetchAllStats({ days })
    },

    // Force refresh all stats, bypassing cache
    // Note: Currently waits for in-flight requests to complete.
    // Future enhancement: AbortController could cancel slow requests for true force refresh.
    refreshAllStats: async (params = {}) => {
      if (isRefreshing) {
        return false // Another refresh is already in progress
      }

      isRefreshing = true
      try {
        lastAllStatsFetch = 0 // Reset cache
        lastParamsKey = '' // Reset params key
        const result = await get().fetchAllStats(params)
        return result
      } finally {
        isRefreshing = false
      }
    },

    // Initialize the store with all dashboard stats
    initialize: async () => {
      await get().fetchAllStats()
    },
  })),
)
