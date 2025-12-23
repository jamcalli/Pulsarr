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
 * Custom useQuery wrapper that enforces minimum loading duration
 *
 * Shows skeleton loaders during ALL fetches (initial + refetches) for at least
 * MIN_LOADING_DELAY milliseconds. This provides consistent visual feedback
 * rather than flickering loading states on fast responses.
 *
 * Usage:
 * ```typescript
 * const { data, isLoading, error } = useAppQuery({
 *   queryKey: ['dashboard-stats', { days: 30 }],
 *   queryFn: () => apiClient.get('/v1/stats/all?days=30'),
 * })
 *
 * if (isLoading) return <Skeleton />
 * ```
 */
export function useAppQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  const query = useQuery(options)
  const [isLoadingWithMin, setIsLoadingWithMin] = useState(query.isLoading)
  const loadingStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (query.isFetching) {
      // Start tracking loading time
      if (!loadingStartRef.current) {
        loadingStartRef.current = Date.now()
        setIsLoadingWithMin(true)
      }
    } else if (loadingStartRef.current) {
      // Fetch completed - enforce minimum duration
      const elapsed = Date.now() - loadingStartRef.current
      const remaining = MIN_LOADING_DELAY - elapsed

      if (remaining > 0) {
        const timer = setTimeout(() => {
          setIsLoadingWithMin(false)
          loadingStartRef.current = null
        }, remaining)
        return () => clearTimeout(timer)
      }

      setIsLoadingWithMin(false)
      loadingStartRef.current = null
    }
  }, [query.isFetching])

  return {
    ...query,
    // Override loading states to use minimum duration
    isLoading: isLoadingWithMin,
    // Keep isFetching aligned for consistency
    isFetching: isLoadingWithMin || query.isFetching,
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
