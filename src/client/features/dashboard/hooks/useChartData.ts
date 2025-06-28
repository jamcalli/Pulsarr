import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'

// This hook provides the status transition data
export function useStatusTransitionData() {
  const { statusTransitions, loading, errors } = useDashboardStore()

  return {
    data: statusTransitions || [],
    isLoading: loading.statusTransitions,
    error: errors.statusTransitions,
  }
}

// This hook provides the content distribution data
export function useContentDistributionData() {
  const { contentTypeDistribution, loading, errors } = useDashboardStore()

  return {
    data: contentTypeDistribution || [],
    isLoading: loading.all,
    error: errors.all,
  }
}

/**
 * Provides notification statistics data from the dashboard store.
 *
 * @returns An object containing `data` with notification statistics, `isLoading` indicating loading state, and `error` for any related errors.
 */
export function useNotificationStatsData() {
  const { notificationStats, loading, errors } = useDashboardStore()

  return {
    data: notificationStats,
    isLoading: loading.notifications,
    error: errors.notifications,
  }
}

/**
 * Retrieves the top genres data from the dashboard store.
 *
 * @returns An object containing the top genres array (`data`), a loading state (`isLoading`), and any error information (`error`).
 */
export function useTopGenresData() {
  const { topGenres, loading, errors } = useDashboardStore()

  return {
    data: topGenres || [],
    isLoading: loading.genres,
    error: errors.genres,
  }
}

/**
 * Returns grabbed-to-notified times data, loading status, and error state from the dashboard store.
 *
 * @returns An object containing `data` (array of grabbed-to-notified times, or empty array if unavailable), `isLoading` (boolean indicating loading state), and `error` (any error encountered).
 */
export function useGrabbedToNotifiedData() {
  const { grabbedToNotifiedTimes, loading, errors } = useDashboardStore()

  return {
    data: grabbedToNotifiedTimes || [],
    isLoading: loading.all,
    error: errors.all,
  }
}

/**
 * Returns instance content breakdown data, loading state, and error information from the dashboard store.
 *
 * The returned object contains the current instance content breakdown array (or an empty array if unavailable), a boolean indicating if data is loading, and any error encountered during data retrieval.
 *
 * @returns An object with `data` (instance content breakdown array), `isLoading` (boolean), and `error` (error state)
 */
export function useInstanceContentData() {
  const { instanceContentBreakdown, loading, errors } = useDashboardStore()

  return {
    data: instanceContentBreakdown || [],
    isLoading: loading.all,
    error: errors.all,
  }
}
