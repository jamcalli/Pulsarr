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
 * Returns the top genres data, loading state, and error from the dashboard store.
 *
 * The data defaults to an empty array if unavailable.
 *
 * @returns An object with `data` (top genres array), `isLoading` (loading state for genres), and `error` (error related to genres data)
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
 * Returns grabbed-to-notified times data, its loading state, and any related error from the dashboard store.
 *
 * @returns An object with the grabbed-to-notified times array (empty if unavailable), a loading flag, and an error message if present.
 */
export function useGrabbedToNotifiedData() {
  const { grabbedToNotifiedTimes, loading, errors } = useDashboardStore()

  return {
    data: grabbedToNotifiedTimes || [],
    isLoading: loading.grabbedToNotified,
    error: errors.grabbedToNotified,
  }
}

/**
 * Returns instance content breakdown data, its loading state, and any related error from the dashboard store.
 *
 * @returns An object with the instance content breakdown array (empty if unavailable), a loading flag, and an error value.
 */
export function useInstanceContentData() {
  const { instanceContentBreakdown, loading, errors } = useDashboardStore()

  return {
    data: instanceContentBreakdown || [],
    isLoading: loading.instanceContent,
    error: errors.instanceContent,
  }
}
