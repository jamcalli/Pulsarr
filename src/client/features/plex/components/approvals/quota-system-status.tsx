import { SystemStatus } from '@/components/ui/system-status'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface QuotaSystemStatusProps {
  job: JobStatus | null | undefined
  formatLastRun: (lastRun: JobStatus['last_run'] | null | undefined) => string
  formatNextRun: (nextRun: JobStatus['next_run'] | null | undefined) => string
  isLoading: boolean
}

/**
 * Quota System Status Component
 *
 * Displays current schedule status, last run, and next run information
 * specifically for the quota maintenance system.
 */
export function QuotaSystemStatus(props: QuotaSystemStatusProps) {
  return (
    <SystemStatus
      {...props}
      description="Resets daily, weekly rolling, and monthly quotas based on configuration, and cleans up old usage records to maintain database performance."
    />
  )
}
