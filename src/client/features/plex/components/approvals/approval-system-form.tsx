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
import { useApprovalSystem } from '@/features/plex/hooks/useApprovalSystem'
import { useMediaQuery } from '@/hooks/use-media-query'

/**
 * Approval System Configuration Form
 *
 * Follows the exact delete sync pattern with actions, status, schedule, and settings.
 */
export function ApprovalSystemForm() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const {
    // Schedule management
    approvalMaintenanceJob,
    schedulerError,
    toggleApprovalSchedule,
    runApprovalNow,
    isTogglingApproval,
    isRunningApproval,
    formatLastRun,
    formatNextRun,

    // Schedule configuration
    approvalInterval,

    // Form management
    form,
    isSaving: isFormSaving,
    onSubmit,
    handleCancel,
  } = useApprovalSystem()

  if (schedulerError) {
    return (
      <div className="flex justify-center items-center h-24 text-red-500">
        <AlertTriangle className="h-6 w-6 mr-2" />
        <span>Error loading schedule: {schedulerError}</span>
      </div>
    )
  }

  const isScheduleEnabled = approvalMaintenanceJob?.enabled || false
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
            onClick={() => toggleApprovalSchedule(!isScheduleEnabled)}
            disabled={isTogglingApproval || !approvalMaintenanceJob}
            variant={isScheduleEnabled ? 'error' : 'noShadow'}
            className="h-8"
          >
            {isTogglingApproval ? (
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
            onClick={runApprovalNow}
            disabled={!isScheduleEnabled || isRunningApproval}
            variant="noShadow"
            className="h-8"
          >
            {isRunningApproval ? (
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
              {formatLastRun(approvalMaintenanceJob?.last_run)}
              {approvalMaintenanceJob?.last_run?.status === 'failed' && (
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
              {formatNextRun(approvalMaintenanceJob?.next_run)}
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
              name="scheduleInterval"
              render={({ field }) => (
                <div className="flex-shrink-0">
                  <Select
                    value={
                      field.value?.toString() ||
                      (approvalInterval?.toString() ?? '')
                    }
                    onValueChange={(value) =>
                      field.onChange(Number.parseInt(value))
                    }
                    disabled={!isScheduleEnabled || isSaving}
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
                </div>
              )}
            />

            {approvalMaintenanceJob &&
              approvalMaintenanceJob.type === 'cron' &&
              approvalMaintenanceJob.config?.expression && (
                <div className="mt-2 text-xs text-text">
                  <p>
                    Current schedule:{' '}
                    {isSaving && form.getValues('scheduleInterval')
                      ? `Every ${form.getValues('scheduleInterval')} hour${form.getValues('scheduleInterval') !== 1 ? 's' : ''}`
                      : approvalInterval
                        ? `Every ${approvalInterval} hour${approvalInterval !== 1 ? 's' : ''}`
                        : 'Not configured'}
                  </p>
                </div>
              )}
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-sm text-text mb-2">
                Expiration Settings
              </h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="approvalExpiration.enabled"
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
                          Enable Approval Expiration
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                When enabled, approval requests will
                                automatically expire after the configured time
                                period.
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
                  name="approvalExpiration.defaultExpirationHours"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0">
                          Expiration Period (Hours)
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Number of hours before approval requests
                                automatically expire.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={8760}
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="w-20 text-center"
                          placeholder="72"
                          disabled={!form.watch('approvalExpiration.enabled')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="approvalExpiration.expirationAction"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0">
                          Expiration Action
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="max-w-xs space-y-2">
                                <p>What happens when approvals expire:</p>
                                <ul className="list-disc pl-4 text-sm">
                                  <li>
                                    <strong>Mark as Expired:</strong> Requests
                                    become inaccessible but stay in database for
                                    history
                                  </li>
                                  <li>
                                    <strong>Auto Approve:</strong> Automatically
                                    approve and process expired requests (adds
                                    content to Radarr/Sonarr)
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
                          disabled={!form.watch('approvalExpiration.enabled')}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select action" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="expire">
                              Mark as Expired
                            </SelectItem>
                            <SelectItem value="auto_approve">
                              Auto Approve & Process
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
                  name="approvalExpiration.cleanupExpiredDays"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <div className="flex items-center">
                        <FormLabel className="text-text m-0">
                          Cleanup Expired After (Days)
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 ml-2 text-text cursor-help flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Number of days to keep expired approval records
                                before they are automatically deleted.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="w-20 text-center"
                          placeholder="30"
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
