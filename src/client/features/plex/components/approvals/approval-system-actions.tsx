import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Power, PlayCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface ApprovalSystemActionsProps {
  isScheduleEnabled: boolean
  isToggling: boolean
  isRunning: boolean
  isLoading: boolean
  onToggleSchedule: (enabled: boolean) => void
  onRunNow: () => void
  job: JobStatus | null | undefined
}

/**
 * Renders operational controls for managing the approval maintenance schedule, including enable/disable and immediate run actions.
 *
 * Displays the current job status with a badge, provides buttons to toggle the schedule and run maintenance, and shows a warning if the schedule is disabled.
 */
export function ApprovalSystemActions({
  isScheduleEnabled,
  isToggling,
  isRunning,
  isLoading,
  onToggleSchedule,
  onRunNow,
  job,
}: ApprovalSystemActionsProps) {
  const getStatusBadge = () => {
    return (
      <Badge
        variant="neutral"
        className={cn(
          'px-2 py-0.5 h-7 text-sm',
          job?.enabled
            ? 'bg-green-500 hover:bg-green-500 text-white'
            : job?.last_run?.status === 'failed'
              ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
              : 'bg-red-500 hover:bg-red-500 text-white',
        )}
      >
        {!job
          ? 'Unknown'
          : !job.enabled
            ? 'Disabled'
            : job.last_run?.status === 'failed'
              ? 'Failed'
              : 'Enabled'}
      </Badge>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-text">Operational Control</h3>
          {getStatusBadge()}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          size="sm"
          onClick={() => onToggleSchedule(!isScheduleEnabled)}
          disabled={isToggling || !job || isLoading}
          variant={isScheduleEnabled ? 'error' : 'noShadow'}
          className="h-8"
        >
          {isToggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          <span className="ml-2">
            {isScheduleEnabled ? 'Disable Schedule' : 'Enable Schedule'}
          </span>
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={onRunNow}
          disabled={!isScheduleEnabled || isRunning || isLoading}
          variant="noShadow"
          className="h-8"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          <span className="ml-2">Run Maintenance Now</span>
        </Button>
      </div>

      {!isScheduleEnabled && (
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <div className="flex items-start">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">Schedule Disabled</p>
              <p>
                The approval maintenance schedule is disabled. Approval
                expiration, auto-approval, and cleanup will not function until
                the schedule is enabled.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
