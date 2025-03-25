import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, PlayCircle, AlertTriangle, Check, Power, Clock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel,
  FormMessage
} from '@/components/ui/form'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { TimeSelector } from '@/components/ui/time-input'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
import { DeleteSyncResults } from '@/features/utilities/components/delete-sync-results'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion'
import type { JobStatus, IntervalConfig } from '@root/schemas/scheduler/scheduler.schema'

// Schema for delete sync form
const deleteSyncSchema = z.object({
  deleteMovie: z.boolean(),
  deleteEndedShow: z.boolean(),
  deleteContinuingShow: z.boolean(),
  deleteFiles: z.boolean(),
  respectUserSyncSetting: z.boolean(),
  deleteSyncNotify: z.enum(['none', 'message', 'webhook', 'both']),
  maxDeletionPrevention: z.coerce.number().int().min(1).max(100).optional(),
  scheduleTime: z.date().optional(),
  dayOfWeek: z.string().default('*')
})

type DeleteSyncFormValues = z.infer<typeof deleteSyncSchema>

export function UtilitiesDashboard() {
  const { 
    schedules, 
    loading, 
    error, 
    fetchSchedules, 
    runDryDeleteSync,
    runScheduleNow,
    toggleScheduleStatus
  } = useUtilitiesStore()
  
  const { config, updateConfig } = useConfigStore()
  
  const [isDryRunLoading, setIsDryRunLoading] = useState(false)
  const [dryRunError, setDryRunError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [scheduleTime, setScheduleTime] = useState<Date | undefined>(undefined)
  const [dayOfWeek, setDayOfWeek] = useState<string>('*')

  // Form with validation
  const form = useForm<DeleteSyncFormValues>({
    resolver: zodResolver(deleteSyncSchema),
    defaultValues: {
      deleteMovie: false,
      deleteEndedShow: false,
      deleteContinuingShow: false,
      deleteFiles: false,
      respectUserSyncSetting: true,
      deleteSyncNotify: 'none',
      maxDeletionPrevention: undefined,
      scheduleTime: undefined,
      dayOfWeek: '*'
    }
  })

  const getDeleteSyncJob = () => {
    if (!schedules) return null
    return schedules.find(job => job.name === 'delete-sync')
  }

  const deleteSyncJob = getDeleteSyncJob()

  // Extract schedule time from cron if available
  useEffect(() => {
    if (deleteSyncJob && deleteSyncJob.type === 'cron' && deleteSyncJob.config?.expression) {
      try {
        // Parse time from cron expression (assuming format like "0 0 3 * * 1" for 3 AM on Monday)
        const cronParts = deleteSyncJob.config.expression.split(' ');
        if (cronParts.length >= 6) {
          const hour = parseInt(cronParts[2]);
          const minute = parseInt(cronParts[1]);
          const day = cronParts[5];
          
          if (!isNaN(hour) && !isNaN(minute)) {
            const date = new Date();
            date.setHours(hour);
            date.setMinutes(minute);
            date.setSeconds(0);
            date.setMilliseconds(0);
            setScheduleTime(date);
            setDayOfWeek(day);
            
            // Update the form with the new schedule time and day
            form.setValue('scheduleTime', date, { shouldDirty: false });
            form.setValue('dayOfWeek', day, { shouldDirty: false });
          }
        }
      } catch (e) {
        console.error("Failed to parse cron expression", e);
      }
    }
  }, [deleteSyncJob, form]);

  // Update form values when config is loaded
  useEffect(() => {
    if (config) {
      form.reset({
        deleteMovie: config.deleteMovie || false,
        deleteEndedShow: config.deleteEndedShow || false,
        deleteContinuingShow: config.deleteContinuingShow || false,
        deleteFiles: config.deleteFiles || false,
        respectUserSyncSetting: config.respectUserSyncSetting ?? true,
        deleteSyncNotify: config.deleteSyncNotify || 'none',
        maxDeletionPrevention: config.maxDeletionPrevention,
        scheduleTime,
        dayOfWeek
      })
    }
  }, [config, form, scheduleTime, dayOfWeek])

  useEffect(() => {
    if (!schedules) {
      fetchSchedules()
    }
  }, [schedules, fetchSchedules])

  const handleDryRun = async () => {
    setIsDryRunLoading(true)
    setDryRunError(null)
    try {
      // Ensure minimum loading time of 500ms for consistent UX
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500))
      await Promise.all([runDryDeleteSync(), minimumLoadingTime])
    } catch (err) {
      setDryRunError(err instanceof Error ? err.message : 'Failed to run dry run')
    } finally {
      setIsDryRunLoading(false)
    }
  }

  const handleRunNow = async (name: string) => {
    // No flash loading state, just call the function
    await runScheduleNow(name)
  }

  const handleToggleStatus = async (name: string, currentStatus: boolean) => {
    setIsTogglingStatus(true)
    try {
      // Ensure minimum loading time of 500ms for consistent UX
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500))
      await Promise.all([toggleScheduleStatus(name, !currentStatus), minimumLoadingTime])
    } finally {
      setIsTogglingStatus(false)
    }
  }
  
  // Helper functions to format schedule information
  const formatCronExpression = (cronExp: string): string => {
    try {
      const parts = cronExp.split(' ');
      if (parts.length >= 6) {
        const seconds = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const hours = parseInt(parts[2]);
        const dayOfWeek = parts[5];
        
        if (!isNaN(hours) && !isNaN(minutes)) {
          const time = new Date();
          time.setHours(hours, minutes, seconds);
          const timeStr = format(time, 'h:mm a');
          
          let dayStr = '';
          if (dayOfWeek === '*') {
            dayStr = 'every day';
          } else if (dayOfWeek === '0') {
            dayStr = 'on Sunday';
          } else if (dayOfWeek === '1') {
            dayStr = 'on Monday';
          } else if (dayOfWeek === '2') {
            dayStr = 'on Tuesday';
          } else if (dayOfWeek === '3') {
            dayStr = 'on Wednesday';
          } else if (dayOfWeek === '4') {
            dayStr = 'on Thursday';
          } else if (dayOfWeek === '5') {
            dayStr = 'on Friday';
          } else if (dayOfWeek === '6') {
            dayStr = 'on Saturday';
          }
          
          return `Runs at ${timeStr} ${dayStr}`;
        }
      }
      return `Cron: ${cronExp}`;
    } catch (e) {
      return cronExp;
    }
  }
  
  const formatInterval = (config: IntervalConfig): string => {
    const parts = [];
    
    if (config.days) parts.push(`${config.days} day${config.days !== 1 ? 's' : ''}`);
    if (config.hours) parts.push(`${config.hours} hour${config.hours !== 1 ? 's' : ''}`);
    if (config.minutes) parts.push(`${config.minutes} minute${config.minutes !== 1 ? 's' : ''}`);
    if (config.seconds) parts.push(`${config.seconds} second${config.seconds !== 1 ? 's' : ''}`);
    
    return parts.length ? `Every ${parts.join(', ')}` : 'Custom interval';
  }
  
  const getBadgeVariant = (job: JobStatus | null | undefined) => {
    if (!job) return 'bg-gray-400 hover:bg-gray-400 text-white'
    
    if (!job.enabled) {
      return 'bg-red-500 hover:bg-red-500 text-white'
    }
    
    if (job.last_run?.status === 'failed') {
      return 'bg-yellow-500 hover:bg-yellow-500 text-white'
    }
    
    return 'bg-green-500 hover:bg-green-500 text-white'
  }

  const getBadgeText = (job: JobStatus | null | undefined) => {
    if (!job) return 'Unknown'
    
    if (!job.enabled) {
      return 'Stopped'
    }
    
    if (job.last_run?.status === 'failed') {
      return 'Failed'
    }
    
    return 'Running'
  }

  const formatLastRun = (job: JobStatus | null | undefined) => {
    if (!job?.last_run?.time) return 'Never'
    
    try {
      return formatDistanceToNow(parseISO(job.last_run.time), { addSuffix: true })
    } catch (e) {
      return job.last_run.time
    }
  }

  const formatNextRun = (job: JobStatus | null | undefined) => {
    if (!job?.next_run?.time) return 'Not scheduled'
    
    try {
      return formatDistanceToNow(parseISO(job.next_run.time), { addSuffix: true })
    } catch (e) {
      return job.next_run.time
    }
  }

  // Function to handle saving configuration
  const onSubmit = async (data: DeleteSyncFormValues) => {
    setIsSaving(true)
    try {
      // Ensure minimum loading time of 500ms for consistent UX
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500))
      
      // Update config settings
      const updatePromise = updateConfig({
        deleteMovie: data.deleteMovie,
        deleteEndedShow: data.deleteEndedShow,
        deleteContinuingShow: data.deleteContinuingShow,
        deleteFiles: data.deleteFiles,
        respectUserSyncSetting: data.respectUserSyncSetting,
        deleteSyncNotify: data.deleteSyncNotify,
        maxDeletionPrevention: data.maxDeletionPrevention
      })
      
      // Save schedule time if changed and if we have a job ID
      let schedulePromise = Promise.resolve()
      if (data.scheduleTime && deleteSyncJob) {
        const hours = data.scheduleTime.getHours();
        const minutes = data.scheduleTime.getMinutes();
        const dayOfWeek = data.dayOfWeek || '*';
        
        // Create cron expression (seconds minutes hours day month weekday)
        // Using * for day, month and setting the weekday
        const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`;
        
        // Update the schedule through the correct API endpoint
        schedulePromise = fetch(`/v1/scheduler/schedules/delete-sync`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'cron',
            config: {
              expression: cronExpression
            }
          }),
        }).then(() => fetchSchedules())
      }
      
      await Promise.all([updatePromise, schedulePromise, minimumLoadingTime])
      
      // Ensure form is cleaned up after successful save
      form.reset({
        ...data,
        scheduleTime: data.scheduleTime,
        dayOfWeek: data.dayOfWeek
      })
    } catch (error) {
      console.error('Failed to save configuration:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (config) {
      form.reset({
        deleteMovie: config.deleteMovie || false,
        deleteEndedShow: config.deleteEndedShow || false,
        deleteContinuingShow: config.deleteContinuingShow || false,
        deleteFiles: config.deleteFiles || false,
        respectUserSyncSetting: config.respectUserSyncSetting ?? true,
        deleteSyncNotify: config.deleteSyncNotify || 'none',
        maxDeletionPrevention: config.maxDeletionPrevention,
        scheduleTime,
        dayOfWeek
      })
    }
  }
  
  // Handler for time input changes
  const handleTimeChange = (newTime: Date, newDay?: string) => {
    form.setValue('scheduleTime', newTime, { shouldDirty: true });
    if (newDay !== undefined) {
      form.setValue('dayOfWeek', newDay, { shouldDirty: true });
    }
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <h2 className="mb-6 text-2xl font-bold text-text">Utilities</h2>

      <div className="space-y-6">
        {/* Delete Sync Configuration Accordion */}
        <Accordion type="single" collapsible defaultValue="delete-sync" className="w-full">
          <AccordionItem value="delete-sync" className="border-2 border-border rounded-base overflow-hidden">
            <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
              <div className="flex justify-between items-center w-full">
                <div>
                  <h3 className="text-lg font-medium text-text text-left">Delete Sync</h3>
                  <p className="text-sm text-text text-left">Automatically removes content when it's no longer on any watchlists</p>
                </div>
                <Badge 
                  variant="neutral" 
                  className={cn('px-2 py-0.5 h-7 text-sm ml-2', getBadgeVariant(deleteSyncJob))}
                >
                  {getBadgeText(deleteSyncJob)}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-0">
              <div className="p-6 border-t border-border">
                {loading.schedules ? (
                  <div className="flex justify-center items-center h-24">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : error.schedules ? (
                  <div className="flex justify-center items-center h-24 text-red-500">
                    <AlertTriangle className="h-6 w-6 mr-2" />
                    <span>Error loading schedule: {error.schedules}</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Status Control Bar */}
                    <div className="flex items-center gap-4 bg-bw rounded-base p-3 border border-border">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleToggleStatus('delete-sync', Boolean(deleteSyncJob?.enabled))}
                        disabled={loading.schedules || isTogglingStatus}
                        variant={deleteSyncJob?.enabled ? "error" : "default"}
                        className="h-8"
                      >
                        {isTogglingStatus ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Power className="h-4 w-4 mr-2" />
                        )}
                        {deleteSyncJob?.enabled ? 'Stop Service' : 'Start Service'}
                      </Button>
                      
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleRunNow('delete-sync')}
                        disabled={!deleteSyncJob?.enabled || loading.schedules}
                        variant="default"
                        className="h-8"
                      >
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Run Now
                      </Button>
                      
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleDryRun()}
                        disabled={isDryRunLoading}
                        variant="noShadow"
                        className="h-8"
                      >
                        {isDryRunLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Dry Run
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Job Info Section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <h3 className="font-medium text-sm text-text mb-1">Status</h3>
                        <p className="font-medium text-text">
                          {deleteSyncJob?.enabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                      <div>
                        <h3 className="font-medium text-sm text-text mb-1">Last Run</h3>
                        <p className="font-medium text-text">
                          {formatLastRun(deleteSyncJob)}
                          {deleteSyncJob?.last_run?.status === 'failed' && (
                            <span className="text-red-500 ml-2">
                              (Failed)
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <h3 className="font-medium text-sm text-text mb-1">Next Scheduled Run</h3>
                        <p className="font-medium text-text">
                          {formatNextRun(deleteSyncJob)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="border-t border-border pt-4 mt-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2 text-text" />
                          <h3 className="font-medium text-sm text-text">Schedule</h3>
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
                                disabled={isSaving}
                              />
                            </div>
                          )}
                        />
                      </div>
                      {deleteSyncJob && (
                        <div className="mt-2 text-xs text-text">
                          {deleteSyncJob.type === 'cron' && deleteSyncJob.config?.expression && (
                            <p>Current schedule: {formatCronExpression(deleteSyncJob.config.expression)}</p>
                          )}
                          {deleteSyncJob.type === 'interval' && (
                            <p>
                              Current interval: {formatInterval(deleteSyncJob.config)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h3 className="font-medium text-sm text-text mb-2">Configuration</h3>
                            <div className="space-y-4">
                              <FormField
                                control={form.control}
                                name="deleteMovie"
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormControl>
                                      <Switch 
                                        checked={field.value} 
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-text m-0">Delete Movies</FormLabel>
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
                                    <FormLabel className="text-text m-0">Delete Ended Shows</FormLabel>
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
                                    <FormLabel className="text-text m-0">Delete Continuing Shows</FormLabel>
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
                                    <FormLabel className="text-text m-0">Delete Files</FormLabel>
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                          
                          <div>
                            <h3 className="font-medium text-sm text-text mb-2">Safety Settings</h3>
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
                                    <FormLabel className="text-text m-0">Respect User Sync Settings</FormLabel>
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="deleteSyncNotify"
                                render={({ field }) => (
                                  <FormItem className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <FormLabel className="text-text mb-0">Notifications</FormLabel>
                                      <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        value={field.value}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="w-40">
                                            <SelectValue placeholder="Select notification type" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="none">None</SelectItem>
                                          <SelectItem value="message">Message</SelectItem>
                                          <SelectItem value="webhook">Webhook</SelectItem>
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
                                      <FormLabel className="text-text mb-0">Max Deletion Prevention (%)</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min={1}
                                          max={100}
                                          {...field}
                                          className="w-20 text-right"
                                          placeholder="10"
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

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border">
                          {form.formState.isDirty && (
                            <>
                              <Button
                                type="submit"
                                disabled={isSaving || !form.formState.isDirty}
                                className={cn(
                                  "gap-2",
                                  form.formState.isDirty ? "bg-blue hover:bg-blue/90" : ""
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
                                variant="clear"
                                onClick={handleCancel}
                                disabled={isSaving}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
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

        {/* Delete Sync Results Accordion */}
        <Accordion type="single" collapsible defaultValue={loading.deleteSyncDryRun ? "delete-sync-results" : undefined} className="w-full">
          <AccordionItem value="delete-sync-results" className="border-2 border-border rounded-base overflow-hidden">
            <AccordionTrigger className="px-6 py-4 bg-main hover:bg-main hover:no-underline">
              <div className="flex justify-between items-center w-full">
                <div>
                  <h3 className="text-lg font-medium text-text text-left">Delete Sync Results</h3>
                  <p className="text-sm text-text text-left">Preview of items that would be removed during the next delete sync</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-0">
              <div className="border-t border-border">
                <DeleteSyncResults />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}