import { useDashboardStatsQuery } from './useDashboardStatsQuery'

/**
 * Returns status transition data and its loading/error state.
 *
 * @returns An object containing:
 *  - `data`: the `statusTransitions` array or `[]` if undefined
 *  - `isLoading`: boolean indicating the loading state
 *  - `error`: the error message if present
 */
export function useStatusTransitionData() {
  const { data, isLoading, error } = useDashboardStatsQuery()

  return {
    data: data?.status_transitions ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

/**
 * Returns content type distribution data and its loading/error state.
 */
export function useContentDistributionData() {
  const { data, isLoading, error } = useDashboardStatsQuery()

  return {
    data: data?.content_type_distribution ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

/**
 * Returns notification statistics and related load/error state.
 *
 * @returns An object with `data` (notification statistics or `undefined`),
 * `isLoading`, and `error`
 */
export function useNotificationStatsData() {
  const { data, isLoading, error } = useDashboardStatsQuery()

  return {
    data: data?.notification_stats,
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

/**
 * Returns top genres data along with loading and error states.
 *
 * @returns An object containing `data`, `isLoading`, and `error`.
 */
export function useTopGenresData() {
  const { data, isLoading, error } = useDashboardStatsQuery()

  return {
    data: data?.top_genres ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

/**
 * Provides the grabbed-to-notified times data, loading status, and any error.
 *
 * @returns An object containing the grabbed-to-notified times array,
 * a loading indicator, and an error if present.
 */
export function useGrabbedToNotifiedData() {
  const { data, isLoading, error } = useDashboardStatsQuery()

  return {
    data: data?.grabbed_to_notified_times ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

/**
 * Returns instance content breakdown along with loading and error states.
 *
 * @returns An object with:
 *  - `data`: the instance content breakdown array (defaults to `[]`),
 *  - `isLoading`: boolean loading state,
 *  - `error`: any error message.
 */
export function useInstanceContentData() {
  const { data, isLoading, error } = useDashboardStatsQuery()

  return {
    data: data?.instance_content_breakdown ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
  }
}
