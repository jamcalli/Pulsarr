import { useProgressEvents } from '@/hooks/useProgressEvents'
import { useWatchlistEvents } from '@/hooks/useWatchlistEvents'
import { invalidateDashboard } from '@/lib/dashboard-invalidation'

/** Refetches the dashboard queries whenever an approval or watchlist event arrives on the progress stream. */
export function useDashboardInvalidation(): void {
  useProgressEvents('approval', invalidateDashboard)
  useWatchlistEvents()
}
