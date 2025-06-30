import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Power, PlayCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface QuotaSystemActionsProps {
  isScheduleEnabled: boolean
  isToggling: boolean
  isRunning: boolean
  isLoading: boolean
  onToggleSchedule: (enabled: boolean) => void
  onRunNow: () => void
  job: JobStatus | null | undefined
}

/**
 * Renders operational controls for managing the quota maintenance schedule, including status display, enable/disable toggle, and immediate run actions.
 *
 * Provides a visual indicator of the current job status, buttons to enable or disable the schedule and to trigger maintenance immediately, and a warning message when the schedule is disabled.
 *
 * @param isScheduleEnabled - Whether the quota maintenance schedule is currently enabled
 * @param isToggling - Whether the enable/disable action is in progress
 * @param isRunning - Whether the maintenance job is currently running
 * @param isLoading - Whether the component is in a loading state
 * @param onToggleSchedule - Callback to toggle the schedule enabled state
 * @param onRunNow - Callback to trigger running the maintenance job immediately
 * @param job - The current job status object, or null/undefined if unavailable
 */
export function QuotaSystemActions({
  isScheduleEnabled,
  isToggling,
  isRunning,
  isLoading,
  onToggleSchedule,
  onRunNow,
  job,
}: QuotaSystemActionsProps) {
  const getStatusBadge = () => {
    return (
      <Badge
        variant="neutral"
        className={cn(
          'px-2 py-0.5 h-7 text-sm',
          !job
            ? 'bg-gray-500 hover:bg-gray-500 text-white'
            : !job.enabled
              ? 'bg-red-500 hover:bg-red-500 text-white'
              : job.last_run?.status === 'failed'
                ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
                : 'bg-green-500 hover:bg-green-500 text-white',
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
          <h3 className="font-medium text-foreground">Operational Control</h3>
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
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-2 shrink-0" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">Schedule Disabled</p>
              <p>
                The quota maintenance schedule is disabled. Quota resets and
                cleanup will not function until the schedule is enabled.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
