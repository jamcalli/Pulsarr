import { SystemStatus } from '@/components/ui/system-status'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface QuotaSystemStatusProps {
  job: JobStatus | null | undefined
  formatLastRun: (lastRun: JobStatus['last_run'] | null | undefined) => string
  formatNextRun: (nextRun: JobStatus['next_run'] | null | undefined) => string
  isLoading: boolean
}

/**
 * Displays the current status of the quota maintenance system with a predefined description.
 *
 * Renders a system status panel summarizing quota reset schedules and database cleanup activities.
 */
export function QuotaSystemStatus(props: QuotaSystemStatusProps) {
  return (
    <SystemStatus
      {...props}
      description="Resets daily, weekly rolling, and monthly quotas based on configuration, and cleans up old usage records to maintain database performance."
    />
  )
}
