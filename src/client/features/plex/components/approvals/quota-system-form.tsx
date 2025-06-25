import { Button } from '@/components/ui/button'
import {
  Loader2,
  PlayCircle,
  AlertTriangle,
  Power,
  Clock,
  Save,
  X,
  HelpCircle,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TimeSelector } from '@/components/ui/time-input'
import { useQuotaSystem } from '@/features/plex/hooks/useQuotaSystem'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { UseFormReturn } from 'react-hook-form'
import type { ApprovalConfigurationFormData } from '@/features/plex/hooks/useApprovalConfiguration'

/**
 * Helper function to get day name from day index
 */
const getDayName = (dayIndex: number) => {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ]
  return days[dayIndex] || 'Unknown'
}

/**
 * Helper function to format schedule display
 */
const formatScheduleDisplay = (
  isSaving: boolean,
  form: UseFormReturn<ApprovalConfigurationFormData>,
  quotaScheduleTime: Date | null | undefined,
  quotaDayOfWeek: string | null,
) => {
  const time = isSaving ? form.getValues('scheduleTime') : quotaScheduleTime
  const day = isSaving ? form.getValues('dayOfWeek') : quotaDayOfWeek

  const timeStr =
    time && !Number.isNaN(time.getTime())
      ? new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
        }).format(time)
      : 'Not set'

  const dayStr =
    day === '*' ? 'every day' : `on ${getDayName(Number.parseInt(day || '0'))}`

  return `${timeStr} ${dayStr}`
}

/**
 * Renders a comprehensive form for configuring the quota maintenance schedule, reset policies, and cleanup settings.
 *
 * Provides controls to enable or disable the quota schedule, run the maintenance job immediately, and view current status, last run, and next scheduled run. Users can set the schedule time and day, adjust weekly and monthly reset policies, and configure usage history cleanup options. The form supports validation, responsive layout, and displays errors if the schedule fails to load.
 */
export function QuotaSystemForm() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const {
    // Schedule management
    quotaMaintenanceJob,
    schedulerError,
    toggleQuotaSchedule,
    runQuotaNow,
    isTogglingQuota,
    isRunningQuota,
    formatLastRun,
    formatNextRun,

    // Schedule configuration
    quotaScheduleTime,
    quotaDayOfWeek,

    // Form management
    form,
    isSaving: isFormSaving,
    onSubmit,
    handleCancel,
  } = useQuotaSystem()

  if (schedulerError) {
    return (
      <div className="flex justify-center items-center h-24 text-red-500">
        <AlertTriangle className="h-6 w-6 mr-2" />
        <span>Error loading schedule: {schedulerError}</span>
      </div>
    )
  }

  const isScheduleEnabled = quotaMaintenanceJob?.enabled || false
  const isSaving = isFormSaving

  return (
    <div className="space-y-6">
      {/* Actions section */}
      <div>
        <h3 className="font-medium text-text mb-2">Actions</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            size="sm"
            onClick={() => toggleQuotaSchedule(!isScheduleEnabled)}
            disabled={isTogglingQuota || !quotaMaintenanceJob}
            variant={isScheduleEnabled ? 'error' : 'noShadow'}
            className="h-8"
          >
            {isTogglingQuota ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            <span className={isMobile ? 'hidden' : 'ml-2'}>
              {isScheduleEnabled ? 'Disable' : 'Enable'}
            </span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={runQuotaNow}
            disabled={!isScheduleEnabled || isRunningQuota}
            variant="noShadow"
            className="h-8"
          >
            {isRunningQuota ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            <span className={isMobile ? 'hidden' : 'ml-2'}>Run Now</span>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Status section */}
      <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col items-center text-center">
            <h3 className="font-medium text-sm text-text mb-1">Status</h3>
            <p className="font-medium text-text">
              {isScheduleEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <h3 className="font-medium text-sm text-text mb-1">Last Run</h3>
            <p className="font-medium text-text flex items-center">
              {formatLastRun(quotaMaintenanceJob?.last_run)}
              {quotaMaintenanceJob?.last_run?.status === 'failed' && (
                <span className="text-red-500 ml-2 flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Failed
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <h3 className="font-medium text-sm text-text mb-1">
              Next Scheduled Run
            </h3>
            <p className="font-medium text-text">
              {formatNextRun(quotaMaintenanceJob?.next_run)}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Schedule section */}
          <div>
            <div className="flex items-center mb-3">
              <Clock className="h-4 w-4 mr-2 text-text" />
              <h3 className="font-medium text-sm text-text">Schedule</h3>
            </div>

            <FormField
              control={form.control}
              name="scheduleTime"
              render={({ field: timeField }) => (
                <FormField
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field: dayField }) => (
                    <div className="flex-shrink-0">
                      <TimeSelector
                        value={timeField.value}
                        onChange={(date, dayOfWeek) => {
                          timeField.onChange(date)
                          if (dayOfWeek !== undefined) {
                            dayField.onChange(dayOfWeek)
                          }
                        }}
                        dayOfWeek={dayField.value}
                        disabled={!isScheduleEnabled || isSaving}
                        className={
                          isMobile
                            ? 'flex-col items-start justify-start gap-3 w-full'
                            : ''
                        }
                      />
                    </div>
                  )}
                />
              )}
            />

            {quotaMaintenanceJob &&
              quotaMaintenanceJob.type === 'cron' &&
              quotaMaintenanceJob.config?.expression && (
                <div className="mt-2 text-xs text-text">
                  <p>
                    Current schedule:{' '}
                    {formatScheduleDisplay(
                      isSaving,
                      form,
                      quotaScheduleTime,
                      quotaDayOfWeek,
                    )}
                  </p>
                </div>
              )}
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-sm text-text mb-2">
                Reset Policies
              </h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="quotaSettings.weeklyRolling.resetDays"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0 text-sm">
                          Weekly Rolling Period (Days)
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Number of days in the rolling window. The quota
                                maintenance schedule resets weekly rolling
                                quotas every this many days.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter days (1-365)"
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="w-32"
                          min={1}
                          max={365}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quotaSettings.monthly.resetDay"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0 text-sm">
                          Monthly Reset Day
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Day of the month when the quota maintenance
                                schedule resets monthly quotas (1-31).
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter day (1-31)"
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="w-32"
                          min={1}
                          max={31}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quotaSettings.monthly.handleMonthEnd"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0 text-sm">
                          Month-End Handling
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="max-w-xs space-y-2">
                                <p>
                                  How the quota maintenance schedule handles
                                  reset days that don't exist in all months
                                  (e.g., day 31):
                                </p>
                                <ul className="list-disc pl-4 text-sm">
                                  <li>
                                    <strong>Last Day:</strong> Reset on the last
                                    day of the month
                                  </li>
                                  <li>
                                    <strong>Skip Month:</strong> Skip months
                                    without that day
                                  </li>
                                  <li>
                                    <strong>Next Month:</strong> Reset on the
                                    1st of the next month
                                  </li>
                                </ul>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select handling" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="last-day">Last Day</SelectItem>
                            <SelectItem value="skip-month">
                              Skip Month
                            </SelectItem>
                            <SelectItem value="next-month">
                              Next Month
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div>
              <h3 className="font-medium text-sm text-text mb-2">
                Cleanup Settings
              </h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="quotaSettings.cleanup.enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0">
                          Enable Usage History Cleanup
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                When enabled, the quota maintenance schedule
                                will delete old quota usage records after the
                                retention period.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quotaSettings.cleanup.retentionDays"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0 text-sm">
                          Usage History Retention (Days)
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Number of days to keep quota usage records
                                before the quota maintenance schedule deletes
                                them.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter days (1-3650)"
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="w-48"
                          min={1}
                          max={3650}
                          disabled={
                            !form.watch('quotaSettings.cleanup.enabled')
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Action buttons - always show, but disable save when not dirty */}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            {form.formState.isDirty && !isSaving && (
              <Button
                type="button"
                variant="cancel"
                onClick={handleCancel}
                disabled={isSaving}
                className="flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            )}

            <Button
              type="submit"
              disabled={isSaving || !form.formState.isDirty}
              className="flex items-center gap-2"
              variant="blue"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
