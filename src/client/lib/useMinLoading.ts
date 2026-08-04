import { useSpinDelay } from 'spin-delay'
import { LOADER_SHOW_DELAY, MIN_LOADING_DELAY } from './constants'

/**
 * Holds a boolean loading state on for at least MIN_LOADING_DELAY once it
 * appears. No show delay - use for action feedback that must be immediate.
 */
export function useMinDuration(active: boolean): boolean {
  return useSpinDelay(active, { delay: 0, minDuration: MIN_LOADING_DELAY })
}

/**
 * Wraps a query result so `isLoading` only appears when the initial fetch
 * outlasts LOADER_SHOW_DELAY (no skeleton flash on fast responses) and then
 * stays for at least MIN_LOADING_DELAY. Refetches with existing data show
 * stale data silently, matching stale-while-revalidate behavior.
 *
 * Usage: `const query = useMinLoading($api.useQuery('get', '/v1/...'))`
 */
export function useMinLoading<
  T extends { isFetching: boolean; isLoading: boolean; data: unknown },
>(query: T): T {
  const showLoading = useSpinDelay(
    query.isFetching && query.data === undefined,
    { delay: LOADER_SHOW_DELAY, minDuration: MIN_LOADING_DELAY },
  )
  return { ...query, isLoading: showLoading }
}

/**
 * Wraps a mutation result so `isPending` appears immediately (actions need
 * instant feedback) and lasts at least MIN_LOADING_DELAY.
 */
export function useMinLoadingMutation<T extends { isPending: boolean }>(
  mutation: T,
): T {
  const isPending = useMinDuration(mutation.isPending)
  return { ...mutation, isPending }
}

/**
 * Delays a request's resolution to at least MIN_LOADING_DELAY so completion
 * effects (toasts, cache updates, modal closes) don't land jarringly fast.
 * Wrap the fetch promise inside a mutationFn to gate the whole operation,
 * not just the pending flag.
 */
export async function withMinDuration<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    promise,
    new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY)),
  ])
  return result
}
