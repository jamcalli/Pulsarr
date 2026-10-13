import type {
  DashboardStats,
  DashboardStatsData,
} from '@/features/home/hooks/useDashboardStats'

export function dashboardStats(
  data: Partial<DashboardStatsData> = {},
): DashboardStats {
  return {
    days: 30,
    setDays: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    data: {
      top_genres: [],
      most_watched_shows: [],
      most_watched_movies: [],
      top_users: [],
      status_distribution: [],
      content_type_distribution: [],
      recent_activity: {
        new_watchlist_items: 0,
        status_changes: 0,
        notifications_sent: 0,
      },
      request_to_ready_times: [],
      ...data,
    },
    isLoading: false,
    isReady: true,
    isFetching: false,
    updatedAt: 0,
    refresh: vi.fn(),
    errorMessage: null,
  }
}
