import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProgressStore } from '@/stores/progressStore'

/**
 * Centralized SSE subscription for dashboard data.
 *
 * Subscribes to approval events (which fire on every watchlist add,
 * whether manual or auto-approved) and invalidates all dashboard
 * queries for instant updates.
 *
 * Call this once at the dashboard page level to avoid duplicate subscriptions.
 */
export function useDashboardSSE(): void {
  const queryClient = useQueryClient()
  const subscribeToType = useProgressStore((s) => s.subscribeToType)

  useEffect(() => {
    const unsubscribe = subscribeToType('approval', () => {
      // Invalidate all dashboard-related queries for instant refresh
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['recent-requests'] })
    })

    return unsubscribe
  }, [subscribeToType, queryClient])
}
