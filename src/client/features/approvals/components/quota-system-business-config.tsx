import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle, Save, X, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UseFormReturn } from 'react-hook-form'
import type { ApprovalConfigurationFormData } from '@/features/plex/hooks/useApprovalConfiguration'

interface QuotaSystemBusinessConfigProps {
  form: UseFormReturn<ApprovalConfigurationFormData>
  onSubmit: (data: ApprovalConfigurationFormData) => Promise<void>
  onCancel: () => void
  isSaving: boolean
  submittedValues: ApprovalConfigurationFormData | null
  hasChanges: boolean
  isScheduleEnabled: boolean
  isLoading: boolean
}

/**
 * Renders a form for configuring quota reset policies and usage history cleanup settings.
 *
 * Users can specify weekly and monthly quota reset rules, choose how to handle months lacking the specified reset day, and set retention periods for quota usage records. Form fields are dynamically enabled or disabled based on the quota maintenance schedule and loading state. Inline validation and contextual warnings guide user input.
 *
 * @returns The quota system business configuration form UI.
 */
export function QuotaSystemBusinessConfig({
  form,
  onSubmit,
  onCancel,
  isSaving,
  submittedValues,
  hasChanges,
  isScheduleEnabled,
  isLoading,
}: QuotaSystemBusinessConfigProps) {
  // Show submitted values during save or current form values - matching delete sync pattern
  const displayValues =
    isSaving && submittedValues ? submittedValues : form.getValues()
  const isCleanupEnabled = displayValues.quotaSettings?.cleanup?.enabled ?? true
  const isDisabled = isLoading || !isScheduleEnabled

  return (
    <div>
      <h3 className="font-medium text-foreground mb-4">
        Business Logic Configuration
      </h3>

      {/* Schedule Dependency Warning */}
      {!isScheduleEnabled && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <div className="flex items-start">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-2 shrink-0" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">Schedule Required</p>
              <p>
                These settings control quota reset and cleanup behavior, but
                they won't function until the quota maintenance schedule is
                enabled above.
              </p>
            </div>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Reset Policies Section */}
          <div className={cn('space-y-4', !isScheduleEnabled && 'opacity-60')}>
            <div>
              <h4 className="font-medium text-foreground mb-3">
                Reset Policies
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Weekly Rolling Period */}
                <FormField
                  control={form.control}
                  name="quotaSettings.weeklyRolling.resetDays"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-foreground m-0 text-sm">
                          Weekly Rolling Period (Days)
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
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
                          disabled={isDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Monthly Reset Day */}
                <FormField
                  control={form.control}
                  name="quotaSettings.monthly.resetDay"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-foreground m-0 text-sm">
                          Monthly Reset Day
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
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
                          disabled={isDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Month-End Handling */}
              <FormField
                control={form.control}
                name="quotaSettings.monthly.handleMonthEnd"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0 text-sm">
                        Month-End Handling
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="max-w-xs space-y-2">
                              <p>
                                How the quota maintenance schedule handles reset
                                days that don't exist in all months (e.g., day
                                31):
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
                                  <strong>Next Month:</strong> Reset on the 1st
                                  of the next month
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
                        disabled={isDisabled}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select handling" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="last-day">Last Day</SelectItem>
                          <SelectItem value="skip-month">Skip Month</SelectItem>
                          <SelectItem value="next-month">Next Month</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Cleanup Settings Section */}
          <div className={cn('space-y-4', !isScheduleEnabled && 'opacity-60')}>
            <div>
              <h4 className="font-medium text-foreground mb-3">
                Cleanup Settings
              </h4>

              {/* Enable Cleanup */}
              <FormField
                control={form.control}
                name="quotaSettings.cleanup.enabled"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0 text-sm">
                        Enable Usage History Cleanup
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              When enabled, the quota maintenance schedule will
                              delete old quota usage records after the retention
                              period.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isDisabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Retention Days */}
              <FormField
                control={form.control}
                name="quotaSettings.cleanup.retentionDays"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0 text-sm">
                        Usage History Retention (Days)
                      </FormLabel>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Number of days to keep quota usage records before
                              the quota maintenance schedule deletes them.
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
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="w-48"
                        min={1}
                        max={3650}
                        disabled={isDisabled || !isCleanupEnabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Save/Cancel Controls */}
          {hasChanges && (
            <div className="flex gap-2 pt-4 border-t">
              <Button
                type="submit"
                disabled={isSaving || isDisabled}
                className="h-8"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {isSaving ? 'Saving...' : 'Save Configuration'}
                </span>
              </Button>

              <Button
                type="button"
                variant="neutral"
                onClick={onCancel}
                disabled={isSaving}
                className="h-8"
              >
                <X className="h-4 w-4" />
                <span className="ml-2">Cancel</span>
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  )
}
