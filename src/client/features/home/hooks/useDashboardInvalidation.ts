import { useApprovalEvents } from '@/hooks/useApprovalEvents'
import { invalidateDashboard } from '@/lib/dashboard-invalidation'

/** Refetches the dashboard queries whenever an approval event arrives on the progress stream. */
export function useDashboardInvalidation(): void {
  useApprovalEvents(invalidateDashboard)
}
