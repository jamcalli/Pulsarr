import { useDashboardStatsQuery } from '@/features/home/hooks/useDashboardStatsQuery'
import { apiErrorMessage } from '@/lib/tanstackApi'

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
    error: apiErrorMessage(error),
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
    error: apiErrorMessage(error),
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
    error: apiErrorMessage(error),
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
    error: apiErrorMessage(error),
  }
}

export function useRequestToReadyData() {
  const { data, isLoading, error } = useDashboardStatsQuery()

  return {
    data: data?.request_to_ready_times ?? [],
    isLoading,
    error: apiErrorMessage(error),
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
    error: apiErrorMessage(error),
  }
}
