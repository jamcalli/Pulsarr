import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle, Save, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface ApprovalSystemScheduleProps {
  interval: number | null
  onIntervalChange: (interval: number) => void
  onSave: () => Promise<boolean>
  job: JobStatus | null | undefined
  isLoading: boolean
  isScheduleEnabled: boolean
}

/**
 * Renders a UI for configuring the interval and schedule of an approval maintenance job.
 *
 * Allows users to select a maintenance frequency, view the current schedule and cron expression, and save changes. Controls are disabled when loading or when scheduling is not enabled, and a warning is displayed if schedule configuration is unavailable.
 *
 * @param interval - The current maintenance interval in hours, or null if not set.
 * @param onIntervalChange - Invoked with the new interval when the user selects a different frequency.
 * @param onSave - Async callback to save the schedule configuration; returns a boolean indicating success.
 * @param job - The current job status, which may include schedule type and cron expression.
 * @param isLoading - Indicates if the component is in a loading state.
 * @param isScheduleEnabled - Indicates if scheduling is enabled.
 */
export function ApprovalSystemSchedule({
  interval,
  onIntervalChange,
  onSave,
  job,
  isLoading,
  isScheduleEnabled,
}: ApprovalSystemScheduleProps) {
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
        {/* Interval Selection */}
        <div>
          <div className="flex items-center mb-2">
            <Label className="text-foreground m-0 text-sm">
              Maintenance Frequency
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    How often the approval maintenance job runs to expire
                    requests, perform auto-approvals, and clean up old data.
                    More frequent runs ensure timely processing but use more
                    system resources.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex flex-col space-y-3">
            <Select
              value={interval?.toString() || ''}
              onValueChange={(value) =>
                onIntervalChange(Number.parseInt(value))
              }
              disabled={isDisabled}
            >
              <SelectTrigger className="font-normal focus:ring-0 w-[192px] focus:ring-offset-0">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every hour</SelectItem>
                <SelectItem value="2">Every 2 hours</SelectItem>
                <SelectItem value="3">Every 3 hours</SelectItem>
                <SelectItem value="4">Every 4 hours (default)</SelectItem>
                <SelectItem value="6">Every 6 hours</SelectItem>
                <SelectItem value="8">Every 8 hours</SelectItem>
                <SelectItem value="12">Every 12 hours</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isDisabled || isSaving}
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
                {interval
                  ? `Every ${interval} hour${interval !== 1 ? 's' : ''}`
                  : 'Not configured'}
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
              Schedule configuration is disabled because the approval
              maintenance schedule is not enabled. Enable the schedule above to
              configure timing.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
