import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'

/**
 * Returns status transition data and its loading/error state from the dashboard store.
 *
 * The hook reads `statusTransitions` from the dashboard store and returns an object
 * with `data` (falls back to an empty array when undefined), `isLoading` (mapped to
 * `loading.all`), and `error` (mapped to `errors.all`).
 *
 * @returns An object containing:
 *  - `data`: the `statusTransitions` array or `[]` if undefined
 *  - `isLoading`: boolean indicating the global loading state (`loading.all`)
 *  - `error`: the global error state (`errors.all`)
 */
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
 * Read notification statistics and related load/error state from the dashboard store.
 *
 * Returns the raw `notificationStats` value from the store (may be `undefined`), along with
 * the store's aggregate loading flag and aggregate error.
 *
 * @returns An object with `data` (notification statistics or `undefined`), `isLoading` (aggregate loading state), and `error` (aggregate error)
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
 * Return the dashboard's top genres data along with global loading and error states.
 *
 * The hook returns an object with:
 * - `data`: the `topGenres` slice from the dashboard store (falls back to an empty array if undefined).
 * - `isLoading`: the global `loading.all` flag from the store.
 * - `error`: the global `errors.all` value from the store.
 *
 * @returns An object containing `data`, `isLoading`, and `error`.
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
 * Return instance content breakdown along with loading and error states from the dashboard store.
 *
 * The returned `data` is the `instanceContentBreakdown` slice or an empty array if unavailable.
 * `isLoading` reflects the aggregate `loading.all` flag and `error` is `errors.all`.
 *
 * @returns An object with:
 *  - `data`: the instance content breakdown array (defaults to `[]`),
 *  - `isLoading`: boolean loading state (`loading.all`),
 *  - `error`: any aggregated error (`errors.all`).
 */
export function useInstanceContentData() {
  const { instanceContentBreakdown, loading, errors } = useDashboardStore()

  return {
    data: instanceContentBreakdown || [],
    isLoading: loading.all,
    error: errors.all,
  }
}
