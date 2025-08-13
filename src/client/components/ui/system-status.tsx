import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface SystemStatusProps {
  job: JobStatus | null | undefined
  formatLastRun: (lastRun: JobStatus['last_run'] | null | undefined) => string
  formatNextRun: (nextRun: JobStatus['next_run'] | null | undefined) => string
  isLoading: boolean
  title?: string
  description: string
}

/**
 * Displays a summary of a scheduled job's status, including its current state, last run, next run, and a descriptive overview.
 *
 * Shows loading placeholders while job data is being fetched, and adapts the display for unknown, disabled, or failed job states.
 *
 * @returns A React element presenting the job's schedule status and related details.
 */
export function SystemStatus({
  job,
  formatLastRun,
  formatNextRun,
  isLoading,
  title = "Schedule Status",
  description,
}: SystemStatusProps) {
  if (isLoading) {
    return (
      <div>
        <h3 className="font-medium text-foreground mb-4">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['status', 'last-run', 'next-run'].map((item) => (
            <div key={item} className="flex flex-col items-center text-center">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="font-medium text-foreground mb-4">{title}</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status */}
        <div className="flex flex-col items-center text-center">
          <h4 className="font-medium text-sm text-foreground mb-1">Status</h4>
          <Badge
            variant="neutral"
            className={`px-2 py-0.5 h-7 text-sm ${
              !job
                ? 'bg-gray-500 hover:bg-gray-500 text-white'
                : !job.enabled
                  ? 'bg-red-500 hover:bg-red-500 text-white'
                  : job.last_run?.status === 'failed'
                    ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
                    : 'bg-green-500 hover:bg-green-500 text-white'
            }`}
          >
            {!job
              ? 'Unknown'
              : !job.enabled
                ? 'Disabled'
                : job.last_run?.status === 'failed'
                  ? 'Failed'
                  : 'Active'}
          </Badge>
        </div>

        {/* Last Run */}
        <div className="flex flex-col items-center text-center">
          <h4 className="font-medium text-sm text-foreground mb-1">Last Run</h4>
          <div className="font-medium text-foreground flex items-center">
            {formatLastRun(job?.last_run)}
            {job?.last_run?.status === 'failed' && (
              <span className="text-red-500 ml-2 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Failed
              </span>
            )}
          </div>
        </div>

        {/* Next Run */}
        <div className="flex flex-col items-center text-center">
          <h4 className="font-medium text-sm text-foreground mb-1">Next Run</h4>
          <div className="font-medium text-foreground">
            {job?.enabled ? formatNextRun(job?.next_run) : 'Not scheduled'}
          </div>
        </div>
      </div>

      {/* Schedule Description */}
      {job && (
        <div className="mt-4 p-3 bg-muted/50 rounded-md">
          <p className="text-sm text-muted-foreground">
            <strong>What this schedule does:</strong> {description}
          </p>
        </div>
      )}
    </div>
  )
}