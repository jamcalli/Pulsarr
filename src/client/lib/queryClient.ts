import { QueryClient } from '@tanstack/react-query'

/**
 * Shared QueryClient instance with application defaults
 *
 * Default behavior:
 * - staleTime: 30s - Data considered fresh for 30 seconds (won't refetch)
 * - gcTime: 5min - Unused data kept in memory for 5 minutes
 * - retry: 1 - Retry failed requests once
 * - refetchOnWindowFocus: true - Refetch stale data when tab regains focus
 * - refetchOnReconnect: true - Refetch stale data when network reconnects
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0, // Don't retry mutations by default
    },
  },
})
