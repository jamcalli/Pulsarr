import {
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { MIN_LOADING_DELAY } from './constants'

/**
 * Custom useQuery wrapper with stale-while-revalidate behavior
 *
 * - Initial load (never had data): Shows skeleton for at least MIN_LOADING_DELAY
 * - Refetch (has had data before): Shows stale data silently, no loading indicator
 *
 * Usage:
 * ```typescript
 * const { data, isLoading, error } = useAppQuery({
 *   queryKey: ['approvals', filters],
 *   queryFn: () => fetchApprovals(filters),
 * })
 *
 * if (isLoading) return <Skeleton />
 * return <Data data={data} />
 * ```
 */
export function useAppQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  const query = useQuery(options)

  // Loading when fetching and no data currently available
  // This triggers on initial load AND after resetQueries clears cache
  const isLoadingWithoutData = query.isFetching && query.data === undefined

  // Min duration state for loading (skeleton)
  const [showLoading, setShowLoading] = useState(isLoadingWithoutData)
  const loadingStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (isLoadingWithoutData) {
      if (!loadingStartRef.current) {
        loadingStartRef.current = Date.now()
        setShowLoading(true)
      }
    } else if (loadingStartRef.current) {
      const elapsed = Date.now() - loadingStartRef.current
      const remaining = MIN_LOADING_DELAY - elapsed

      if (remaining > 0) {
        const timer = setTimeout(() => {
          setShowLoading(false)
          loadingStartRef.current = null
        }, remaining)
        return () => clearTimeout(timer)
      }

      setShowLoading(false)
      loadingStartRef.current = null
    }
  }, [isLoadingWithoutData])

  return {
    ...query,
    // isLoading: true when fetching with no data (initial or after reset)
    isLoading: showLoading,
  }
}

/**
 * Custom useMutation wrapper that enforces minimum loading duration
 *
 * Ensures mutation loading states last at least MIN_LOADING_DELAY milliseconds
 * for consistent UI feedback on create/update/delete operations.
 *
 * Usage:
 * ```typescript
 * const { mutate, isPending } = useAppMutation({
 *   mutationFn: (data) => apiClient.post('/v1/api-keys', data),
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
 * })
 * ```
 */
export function useAppMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(options: UseMutationOptions<TData, TError, TVariables, TContext>) {
  const mutation = useMutation(options)
  const [isPendingWithMin, setIsPendingWithMin] = useState(false)
  const loadingStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (mutation.isPending) {
      if (!loadingStartRef.current) {
        loadingStartRef.current = Date.now()
        setIsPendingWithMin(true)
      }
    } else if (loadingStartRef.current) {
      const elapsed = Date.now() - loadingStartRef.current
      const remaining = MIN_LOADING_DELAY - elapsed

      if (remaining > 0) {
        const timer = setTimeout(() => {
          setIsPendingWithMin(false)
          loadingStartRef.current = null
        }, remaining)
        return () => clearTimeout(timer)
      }

      setIsPendingWithMin(false)
      loadingStartRef.current = null
    }
  }, [mutation.isPending])

  return {
    ...mutation,
    isPending: isPendingWithMin,
  }
}
