import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'

// This hook provides the status transition data
export function useStatusTransitionData() {
  const { statusTransitions, loading, errors } = useDashboardStore()

  return {
    data: statusTransitions || [],
    isLoading: loading.all,
    error: errors.all,
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
 * Returns notification statistics data, loading state, and error information from the dashboard store.
 *
 * @returns An object with `data` containing notification statistics, `isLoading` indicating if the data is loading, and `error` for any related errors.
 */
export function useNotificationStatsData() {
  const { notificationStats, loading, errors } = useDashboardStore()

  return {
    data: notificationStats,
    isLoading: loading.all,
    error: errors.all,
  }
}

/**
 * Retrieves the top genres data, loading status, and error from the dashboard store.
 *
 * @returns An object containing `data` (an array of top genres, or an empty array if unavailable), `isLoading` (whether the genres data is loading), and `error` (any error related to genres data)
 */
export function useTopGenresData() {
  const { topGenres, loading, errors } = useDashboardStore()

  return {
    data: topGenres || [],
    isLoading: loading.all,
    error: errors.all,
  }
}

/**
 * Provides the grabbed-to-notified times data, loading status, and any associated error from the dashboard store.
 *
 * @returns An object containing the grabbed-to-notified times array (empty if unavailable), a loading indicator, and an error if present.
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
 * Retrieves the instance content breakdown data, loading state, and error from the dashboard store.
 *
 * @returns An object containing the `instanceContentBreakdown` array (empty if unavailable), a loading flag, and any related error.
 */
export function useInstanceContentData() {
  const { instanceContentBreakdown, loading, errors } = useDashboardStore()

  return {
    data: instanceContentBreakdown || [],
    isLoading: loading.all,
    error: errors.all,
  }
}
