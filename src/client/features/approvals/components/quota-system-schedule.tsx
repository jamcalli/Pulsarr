import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle, Save, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { TimeSelector } from '@/components/ui/time-input'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface QuotaSystemScheduleProps {
  scheduleTime: Date | undefined
  dayOfWeek: string
  onTimeChange: (date: Date, dayOfWeek?: string) => void
  onSave: () => Promise<boolean>
  job: JobStatus | null | undefined
  isLoading: boolean
  isScheduleEnabled: boolean
}

/**
 * Displays a UI for configuring the quota maintenance schedule, allowing users to select a maintenance time and day, view the current schedule, and save changes.
 *
 * Controls are disabled when scheduling is inactive or loading. Shows a warning if scheduling is disabled and displays current schedule details when available.
 */
export function QuotaSystemSchedule({
  scheduleTime,
  dayOfWeek,
  onTimeChange,
  onSave,
  job,
  isLoading,
  isScheduleEnabled,
}: QuotaSystemScheduleProps) {
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave()
    } finally {
      setIsSaving(false)
    }
  }

  const isDisabled = isLoading || !isScheduleEnabled

  return (
    <div>
      <h3 className="font-medium text-foreground mb-4">
        Schedule Configuration
      </h3>

      <div className="space-y-4">
        {/* Time Selection */}
        <div>
          <div className="flex items-center mb-2">
            <Label className="text-foreground m-0 text-sm">
              Maintenance Time
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    Configure when the quota maintenance job runs to reset
                    quotas and cleanup old usage records. Choose a time when
                    system usage is typically low.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex flex-col space-y-3">
            <TimeSelector
              value={scheduleTime}
              onChange={onTimeChange}
              dayOfWeek={dayOfWeek}
              disabled={isDisabled}
            />

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isDisabled || isSaving || !scheduleTime}
                variant="noShadow"
                className="h-8"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">Save Schedule</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Current Schedule Display */}
        {job && job.type === 'cron' && job.config?.expression && (
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="text-xs text-foreground">
              <p>
                <strong>Current schedule:</strong>{' '}
                {scheduleTime && !Number.isNaN(scheduleTime.getTime())
                  ? new Intl.DateTimeFormat('en-US', {
                      hour: 'numeric',
                      minute: 'numeric',
                      hour12: true,
                    }).format(scheduleTime)
                  : 'Not set'}{' '}
                {dayOfWeek === '*'
                  ? 'every day'
                  : `on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number.parseInt(dayOfWeek)] || 'Unknown'}`}
              </p>
              {job.config.expression && (
                <p className="text-muted-foreground mt-1">
                  <strong>Cron expression:</strong> {job.config.expression}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Schedule Dependency Warning */}
        {!isScheduleEnabled && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Schedule configuration is disabled because the quota maintenance
              schedule is not enabled. Enable the schedule above to configure
              timing.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
