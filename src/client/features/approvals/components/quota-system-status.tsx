import { SystemStatus } from '@/components/ui/system-status'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface QuotaSystemStatusProps {
  job: JobStatus | null | undefined
  formatLastRun: (lastRun: JobStatus['last_run'] | null | undefined) => string
  formatNextRun: (nextRun: JobStatus['next_run'] | null | undefined) => string
  isLoading: boolean
}

/**
 * Displays the status of the quota maintenance system, including schedule, last run, and next run information.
 *
 * Renders a system status panel with a fixed description explaining quota resets and database cleanup operations.
 */
export function QuotaSystemStatus(props: QuotaSystemStatusProps) {
  return (
    <SystemStatus
      {...props}
      description="Resets daily, weekly rolling, and monthly quotas based on configuration, and cleans up old usage records to maintain database performance."
    />
  )
}
