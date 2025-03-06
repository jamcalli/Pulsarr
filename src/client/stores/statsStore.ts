import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  GenreStat,
  ContentStat,
  UserStat,
  StatusDistribution,
  ContentTypeDistribution,
  ActivityStats,
  InstanceStat,
  AvailabilityTime,
  StatusTransitionTime,
  StatusFlowData,
  GrabbedToNotifiedTime,
  DashboardStats,
  NotificationStats,
} from '@root/schemas/stats/stats.schema'

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
  }

  // Fetch functions
  fetchAllStats: (params?: { limit?: number; days?: number }) => Promise<void>
  fetchTopGenres: (limit?: number) => Promise<void>
  fetchMostWatchedShows: (limit?: number) => Promise<void>
  fetchMostWatchedMovies: (limit?: number) => Promise<void>
  fetchTopUsers: (limit?: number) => Promise<void>
  fetchRecentActivity: (days?: number) => Promise<void>
  fetchAvailabilityTimes: () => Promise<void>
  fetchGrabbedToNotifiedTimes: () => Promise<void>
  fetchStatusTransitions: () => Promise<void>
  fetchStatusFlow: () => Promise<void>
  fetchNotificationStats: (days?: number) => Promise<void>

  // Initialization
  initialize: () => Promise<void>
}

export const useStatsStore = create<StatsState>()(
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
    },

    // Fetch all dashboard stats at once
    fetchAllStats: async (params = {}) => {
      const { limit = 10, days = 30 } = params
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

        const response = await fetch(`/v1/stats/all?${queryParams}`)
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
          loading: { ...state.loading, all: false },
        }))
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
      }
    },

    // Individual fetch functions for specific stats
    fetchTopGenres: async (limit = 10) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, genres: true },
        errors: { ...state.errors, genres: null },
      }))

      try {
        const response = await fetch(`/v1/stats/genres?limit=${limit}`)
        if (!response.ok) {
          throw new Error('Failed to fetch top genres')
        }

        const data: GenreStat[] = await response.json()

        set((state) => ({
          ...state,
          topGenres: data,
          loading: { ...state.loading, genres: false },
        }))
      } catch (error) {
        console.error('Error fetching top genres:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, genres: false },
          errors: {
            ...state.errors,
            genres: error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchMostWatchedShows: async (limit = 10) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, shows: true },
        errors: { ...state.errors, shows: null },
      }))

      try {
        const response = await fetch(`/v1/stats/shows?limit=${limit}`)
        if (!response.ok) {
          throw new Error('Failed to fetch most watched shows')
        }

        const data: ContentStat[] = await response.json()

        set((state) => ({
          ...state,
          mostWatchedShows: data,
          loading: { ...state.loading, shows: false },
        }))
      } catch (error) {
        console.error('Error fetching most watched shows:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, shows: false },
          errors: {
            ...state.errors,
            shows: error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchMostWatchedMovies: async (limit = 10) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, movies: true },
        errors: { ...state.errors, movies: null },
      }))

      try {
        const response = await fetch(`/v1/stats/movies?limit=${limit}`)
        if (!response.ok) {
          throw new Error('Failed to fetch most watched movies')
        }

        const data: ContentStat[] = await response.json()

        set((state) => ({
          ...state,
          mostWatchedMovies: data,
          loading: { ...state.loading, movies: false },
        }))
      } catch (error) {
        console.error('Error fetching most watched movies:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, movies: false },
          errors: {
            ...state.errors,
            movies: error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchTopUsers: async (limit = 10) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, users: true },
        errors: { ...state.errors, users: null },
      }))

      try {
        const response = await fetch(`/v1/stats/users?limit=${limit}`)
        if (!response.ok) {
          throw new Error('Failed to fetch top users')
        }

        const data: UserStat[] = await response.json()

        set((state) => ({
          ...state,
          topUsers: data,
          loading: { ...state.loading, users: false },
        }))
      } catch (error) {
        console.error('Error fetching top users:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, users: false },
          errors: {
            ...state.errors,
            users: error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchRecentActivity: async (days = 30) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, activity: true },
        errors: { ...state.errors, activity: null },
      }))

      try {
        const response = await fetch(`/v1/stats/activity?days=${days}`)
        if (!response.ok) {
          throw new Error('Failed to fetch recent activity')
        }

        const data: ActivityStats = await response.json()

        set((state) => ({
          ...state,
          recentActivity: data,
          loading: { ...state.loading, activity: false },
        }))
      } catch (error) {
        console.error('Error fetching recent activity:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, activity: false },
          errors: {
            ...state.errors,
            activity: error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchAvailabilityTimes: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, availability: true },
        errors: { ...state.errors, availability: null },
      }))

      try {
        const response = await fetch('/v1/stats/availability')
        if (!response.ok) {
          throw new Error('Failed to fetch availability times')
        }

        const data: AvailabilityTime[] = await response.json()

        set((state) => ({
          ...state,
          availabilityTimes: data,
          loading: { ...state.loading, availability: false },
        }))
      } catch (error) {
        console.error('Error fetching availability times:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, availability: false },
          errors: {
            ...state.errors,
            availability:
              error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchGrabbedToNotifiedTimes: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, grabbedToNotified: true },
        errors: { ...state.errors, grabbedToNotified: null },
      }))

      try {
        const response = await fetch('/v1/stats/grabbed-to-notified')
        if (!response.ok) {
          throw new Error('Failed to fetch grabbed-to-notified times')
        }

        const data: GrabbedToNotifiedTime[] = await response.json()

        set((state) => ({
          ...state,
          grabbedToNotifiedTimes: data,
          loading: { ...state.loading, grabbedToNotified: false },
        }))
      } catch (error) {
        console.error('Error fetching grabbed-to-notified times:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, grabbedToNotified: false },
          errors: {
            ...state.errors,
            grabbedToNotified:
              error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchStatusTransitions: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, statusTransitions: true },
        errors: { ...state.errors, statusTransitions: null },
      }))

      try {
        const response = await fetch('/v1/stats/status-transitions')
        if (!response.ok) {
          throw new Error('Failed to fetch status transitions')
        }

        const data: StatusTransitionTime[] = await response.json()

        set((state) => ({
          ...state,
          statusTransitions: data,
          loading: { ...state.loading, statusTransitions: false },
        }))
      } catch (error) {
        console.error('Error fetching status transitions:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, statusTransitions: false },
          errors: {
            ...state.errors,
            statusTransitions:
              error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchStatusFlow: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, statusFlow: true },
        errors: { ...state.errors, statusFlow: null },
      }))

      try {
        const response = await fetch('/v1/stats/status-flow')
        if (!response.ok) {
          throw new Error('Failed to fetch status flow data')
        }

        const data: StatusFlowData[] = await response.json()

        set((state) => ({
          ...state,
          statusFlow: data,
          loading: { ...state.loading, statusFlow: false },
        }))
      } catch (error) {
        console.error('Error fetching status flow data:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, statusFlow: false },
          errors: {
            ...state.errors,
            statusFlow:
              error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    fetchNotificationStats: async (days = 30) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, notifications: true },
        errors: { ...state.errors, notifications: null },
      }))

      try {
        const response = await fetch(`/v1/stats/notifications?days=${days}`)
        if (!response.ok) {
          throw new Error('Failed to fetch notification statistics')
        }

        const data: NotificationStats = await response.json()

        set((state) => ({
          ...state,
          notificationStats: data,
          loading: { ...state.loading, notifications: false },
        }))
      } catch (error) {
        console.error('Error fetching notification statistics:', error)
        set((state) => ({
          ...state,
          loading: { ...state.loading, notifications: false },
          errors: {
            ...state.errors,
            notifications:
              error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    },

    // Initialize the store with all dashboard stats
    initialize: async () => {
      await get().fetchAllStats()
    },
  })),
)
