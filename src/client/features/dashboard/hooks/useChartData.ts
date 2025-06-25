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

// This hook provides notification stats data
export function useNotificationStatsData() {
  const { notificationStats, loading, errors } = useDashboardStore()

  return {
    data: notificationStats,
    isLoading: loading.notifications,
    error: errors.notifications,
  }
}

/**
 * Provides access to the top genres data from the dashboard store.
 *
 * Returns an object containing the top genres array, loading state, and any associated error.
 *
 * @returns An object with `data` (top genres array), `isLoading` (loading state), and `error` (error information).
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
 * Provides grabbed-to-notified times data from the dashboard store.
 *
 * Returns an object containing the grabbed-to-notified times array, a loading state, and any associated error.
 *
 * @returns An object with `data` (array of grabbed-to-notified times), `isLoading` (boolean), and `error` (any error encountered).
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
 * Provides instance content breakdown data from the dashboard store.
 *
 * Returns the current instance content breakdown array, overall loading state, and any associated error.
 *
 * @returns An object containing `data` (instance content breakdown array), `isLoading` (loading state), and `error` (error state).
 */
export function useInstanceContentData() {
  const { instanceContentBreakdown, loading, errors } = useDashboardStore()

  return {
    data: instanceContentBreakdown || [],
    isLoading: loading.all,
    error: errors.all,
  }
}
