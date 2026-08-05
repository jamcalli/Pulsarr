import { useSpinDelay } from 'spin-delay'
import { LOADER_SHOW_DELAY, MIN_LOADING_DELAY } from './constants'

/**
 * Holds a boolean loading state on for at least MIN_LOADING_DELAY once it
 * appears. No show delay - use for action feedback that must be immediate.
 */
export function useMinDuration(active: boolean): boolean {
  // ssr: false - the ssr default shows spinners instantly on first render,
  // bypassing show delays (this is a SPA, there is no server render)
  return useSpinDelay(active, {
    delay: 0,
    minDuration: MIN_LOADING_DELAY,
    ssr: false,
  })
}

/**
 * Envelope over any readiness boolean: true only when unreadiness outlasts
 * LOADER_SHOW_DELAY, then held at least MIN_LOADING_DELAY. Render null while
 * the input is true but this is still false (the show-delay window).
 */
export function useShowLoading(loading: boolean): boolean {
  return useSpinDelay(loading, {
    delay: LOADER_SHOW_DELAY,
    minDuration: MIN_LOADING_DELAY,
    ssr: false,
  })
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
    { delay: LOADER_SHOW_DELAY, minDuration: MIN_LOADING_DELAY, ssr: false },
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
  const delay = new Promise<void>((resolve) =>
    setTimeout(resolve, MIN_LOADING_DELAY),
  )

  try {
    return await promise
  } finally {
    await delay
  }
}
