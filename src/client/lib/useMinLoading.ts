import { useEffect, useRef, useState } from 'react'
import { MIN_LOADING_DELAY } from './constants'

function useMinDuration(active: boolean): boolean {
  const [show, setShow] = useState(active)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (active) {
      if (!startRef.current) {
        startRef.current = Date.now()
        setShow(true)
      }
    } else if (startRef.current) {
      const elapsed = Date.now() - startRef.current
      const remaining = MIN_LOADING_DELAY - elapsed

      if (remaining > 0) {
        const timer = setTimeout(() => {
          setShow(false)
          startRef.current = null
        }, remaining)
        return () => clearTimeout(timer)
      }

      setShow(false)
      startRef.current = null
    }
  }, [active])

  return show
}

/**
 * Wraps a query result so `isLoading` lasts at least MIN_LOADING_DELAY,
 * keeping skeleton loaders from flashing. Refetches with existing data
 * show stale data silently, matching stale-while-revalidate behavior.
 *
 * Usage: `const query = useMinLoading($api.useQuery('get', '/v1/...'))`
 */
export function useMinLoading<
  T extends { isFetching: boolean; isLoading: boolean; data: unknown },
>(query: T): T {
  const showLoading = useMinDuration(
    query.isFetching && query.data === undefined,
  )
  return { ...query, isLoading: showLoading }
}

/**
 * Wraps a mutation result so `isPending` lasts at least MIN_LOADING_DELAY
 * for consistent UI feedback on create/update/delete operations.
 */
export function useMinLoadingMutation<T extends { isPending: boolean }>(
  mutation: T,
): T {
  const isPending = useMinDuration(mutation.isPending)
  return { ...mutation, isPending }
}
