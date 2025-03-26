import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  PlayCircle,
  AlertTriangle,
  Check,
  Power,
  Clock,
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
import { cn } from '@/lib/utils'
import { TimeSelector } from '@/components/ui/time-input'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { useDeleteSync } from '@/features/utilities/hooks/useDeleteSync'

export function DeleteSyncForm() {
  const {
    form,
    error,
    isDryRunLoading,
    dryRunError,
    isSaving,
    submittedValues,
    isTogglingStatus,
    isRunningJob,
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,
    formatLastRun,
    formatNextRun,
    handleDryRun,
    handleRunNow,
    handleToggleStatus,
    onSubmit,
    handleCancel,
    handleTimeChange,
  } = useDeleteSync()

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="delete-sync"
      className="w-full"
    >
      <AccordionItem
        value="delete-sync"
        className="border-2 border-border rounded-base overflow-hidden"
      >
        <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
          <div className="flex justify-between items-center w-full">
            <div>
              <h3 className="text-lg font-medium text-text text-left">
                Delete Sync
              </h3>
              <p className="text-sm text-text text-left">
                Automatically removes content when it's no longer on any
                watchlists
              </p>
            </div>
            <Badge
              variant="neutral"
              className={cn(
                'px-2 py-0.5 h-7 text-sm ml-2',
                deleteSyncJob?.enabled
                  ? 'bg-green-500 hover:bg-green-500 text-white'
                  : deleteSyncJob?.last_run?.status === 'failed'
                    ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
                    : 'bg-red-500 hover:bg-red-500 text-white',
              )}
            >
              {!deleteSyncJob
                ? 'Unknown'
                : !deleteSyncJob.enabled
                  ? 'Stopped'
                  : deleteSyncJob.last_run?.status === 'failed'
                    ? 'Failed'
                    : 'Running'}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-0">
          <div className="p-6 border-t border-border">
            {error ? (
              <div className="flex justify-center items-center h-24 text-red-500">
                <AlertTriangle className="h-6 w-6 mr-2" />
                <span>Error loading schedule: {error}</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Actions section */}
                <div>
                  <h3 className="font-medium text-text mb-2">Actions</h3>
                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleToggleStatus}
                      disabled={isTogglingStatus || !deleteSyncJob}
                      variant={deleteSyncJob?.enabled ? 'error' : 'default'}
                      className="h-8"
                    >
                      {isTogglingStatus ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Power className="h-4 w-4 mr-2" />
                      )}
                      {deleteSyncJob?.enabled
                        ? 'Stop Service'
                        : 'Start Service'}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleRunNow}
                      disabled={!deleteSyncJob?.enabled || isRunningJob}
                      variant="default"
                      className="h-8"
                    >
                      {isRunningJob ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <PlayCircle className="h-4 w-4 mr-2" />
                      )}
                      Run Now
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleDryRun}
                      disabled={isDryRunLoading}
                      variant="noShadow"
                      className="h-8"
                    >
                      {isDryRunLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Dry Run
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Status section */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h3 className="font-medium text-sm text-text mb-1">
                        Status
                      </h3>
                      <p className="font-medium text-text">
                        {deleteSyncJob?.enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-text mb-1">
                        Last Run
                      </h3>
                      <p className="font-medium text-text flex items-center">
                        {formatLastRun(deleteSyncJob?.last_run)}
                        {deleteSyncJob?.last_run?.status === 'failed' && (
                          <span className="text-red-500 ml-2 flex items-center">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Failed
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-text mb-1">
                        Next Scheduled Run
                      </h3>
                      <p className="font-medium text-text">
                        {formatNextRun(deleteSyncJob?.next_run)}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Schedule section */}
                <div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2 text-text" />
                      <h3 className="font-medium text-sm text-text">
                        Schedule
                      </h3>
                    </div>

                    <FormField
                      control={form.control}
                      name="scheduleTime"
                      render={({ field }) => (
                        <div className="flex-shrink-0">
                          <TimeSelector
                            value={field.value}
                            onChange={handleTimeChange}
                            dayOfWeek={form.watch('dayOfWeek')}
                          />
                        </div>
                      )}
                    />
                  </div>
                  {deleteSyncJob &&
                    deleteSyncJob.type === 'cron' &&
                    deleteSyncJob.config?.expression && (
                      <div className="mt-2 text-xs text-text">
                        <p>
                          Current schedule:{' '}
                          {deleteSyncJob.config.expression === '0 0 * * * *'
                            ? 'Every hour'
                            : `${
                                isSaving &&
                                submittedValues &&
                                submittedValues.scheduleTime
                                  ? new Intl.DateTimeFormat('en-US', {
                                      hour: 'numeric',
                                      minute: 'numeric',
                                      hour12: true,
                                    }).format(submittedValues.scheduleTime)
                                  : scheduleTime
                                    ? new Intl.DateTimeFormat('en-US', {
                                        hour: 'numeric',
                                        minute: 'numeric',
                                        hour12: true,
                                      }).format(scheduleTime)
                                    : ''
                              } ${
                                isSaving &&
                                submittedValues &&
                                submittedValues.dayOfWeek
                                  ? submittedValues.dayOfWeek === '*'
                                    ? 'every day'
                                    : `on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number.parseInt(submittedValues.dayOfWeek)]}`
                                  : dayOfWeek === '*'
                                    ? 'every day'
                                    : `on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number.parseInt(dayOfWeek)]}`
                              }`}
                        </p>
                      </div>
                    )}
                </div>

                <Separator />

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-medium text-sm text-text mb-2">
                          Configuration
                        </h3>
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="deleteMovie"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Switch
                                    checked={
                                      isSaving && submittedValues
                                        ? submittedValues.deleteMovie
                                        : field.value
                                    }
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-text m-0">
                                  Delete Movies
                                </FormLabel>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="deleteEndedShow"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-text m-0">
                                  Delete Ended Shows
                                </FormLabel>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="deleteContinuingShow"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-text m-0">
                                  Delete Continuing Shows
                                </FormLabel>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="deleteFiles"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-text m-0">
                                  Delete Files
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div>
                        <h3 className="font-medium text-sm text-text mb-2">
                          Safety Settings
                        </h3>
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="respectUserSyncSetting"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-text m-0">
                                  Respect User Sync Settings
                                </FormLabel>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="deleteSyncNotify"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <FormLabel className="text-text mb-0">
                                    Notifications
                                  </FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={
                                      isSaving && submittedValues
                                        ? submittedValues.deleteSyncNotify
                                        : field.value
                                    }
                                    disabled={isSaving} // Disable during saving
                                  >
                                    <FormControl>
                                      <SelectTrigger className="w-40">
                                        <SelectValue placeholder="Select notification type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      <SelectItem value="message">
                                        Message
                                      </SelectItem>
                                      <SelectItem value="webhook">
                                        Webhook
                                      </SelectItem>
                                      <SelectItem value="both">Both</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="maxDeletionPrevention"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <FormLabel className="text-text mb-0">
                                    Max Deletion Prevention (%)
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={100}
                                      {...field}
                                      value={
                                        isSaving && submittedValues
                                          ? submittedValues.maxDeletionPrevention ||
                                            ''
                                          : field.value || ''
                                      }
                                      className="w-20 text-right"
                                      placeholder="10"
                                      disabled={isSaving} // Disable during saving
                                    />
                                  </FormControl>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action buttons - only show while isDirty or isSaving */}
                    {(form.formState.isDirty || isSaving) && (
                      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border">
                        <Button
                          type="submit"
                          disabled={isSaving || !form.formState.isDirty}
                          className={cn(
                            'flex items-center gap-2 min-w-[120px]',
                            'bg-blue hover:bg-blue/90',
                          )}
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save Changes'
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="cancel"
                          onClick={handleCancel}
                          disabled={isSaving}
                          className="flex items-center gap-1"
                        >
                          <span>Cancel</span>
                        </Button>
                      </div>
                    )}
                  </form>
                </Form>

                {dryRunError && (
                  <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded border border-red-300 dark:border-red-700">
                    <div className="flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      <span>{dryRunError}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
