import { SystemStatus } from '@/components/ui/system-status'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface ApprovalSystemStatusProps {
  job: JobStatus | null | undefined
  formatLastRun: (lastRun: JobStatus['last_run'] | null | undefined) => string
  formatNextRun: (nextRun: JobStatus['next_run'] | null | undefined) => string
  isLoading: boolean
}

/**
 * Displays the status and scheduling details for the approval system's maintenance tasks.
 *
 * Renders a status panel summarizing how the system expires outdated approval requests, may auto-approve them if configured, and removes expired requests to optimize database performance.
 */
export function ApprovalSystemStatus(props: ApprovalSystemStatusProps) {
  return (
    <SystemStatus
      {...props}
      description="Expires old approval requests based on configuration, automatically approves expired requests if enabled, and cleans up old expired requests to maintain database performance."
    />
  )
}
