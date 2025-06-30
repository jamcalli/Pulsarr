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
 * Retrieves grabbed-to-notified times data along with its loading and error states from the dashboard store.
 *
 * @returns An object containing the grabbed-to-notified times array (empty if unavailable), a loading indicator, and any associated error.
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
 * Retrieves the instance content breakdown data, along with its loading and error states, from the dashboard store.
 *
 * @returns An object containing the instance content breakdown array (or an empty array if unavailable), a loading indicator, and any associated error.
 */
export function useInstanceContentData() {
  const { instanceContentBreakdown, loading, errors } = useDashboardStore()

  return {
    data: instanceContentBreakdown || [],
    isLoading: loading.instanceContent,
    error: errors.instanceContent,
  }
}
