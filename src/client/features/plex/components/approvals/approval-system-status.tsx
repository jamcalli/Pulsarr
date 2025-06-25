import { SystemStatus } from '@/components/ui/system-status'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface ApprovalSystemStatusProps {
  job: JobStatus | null | undefined
  formatLastRun: (lastRun: JobStatus['last_run'] | null | undefined) => string
  formatNextRun: (nextRun: JobStatus['next_run'] | null | undefined) => string
  isLoading: boolean
}

/**
 * Displays the current status and scheduling information for the approval system's maintenance tasks.
 *
 * Renders a system status panel describing how old approval requests are expired, optionally auto-approved, and cleaned up to optimize database performance.
 */
export function ApprovalSystemStatus(props: ApprovalSystemStatusProps) {
  return (
    <SystemStatus
      {...props}
      description="Expires old approval requests based on configuration, automatically approves expired requests if enabled, and cleans up old expired requests to maintain database performance."
    />
  )
}
