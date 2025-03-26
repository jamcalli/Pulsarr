import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, PlayCircle, AlertTriangle, Check, Power, Clock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useState, useEffect } from 'react'
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
import { TimeSelector } from '@/components/ui/time-input'
import { format } from 'date-fns'
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { useDeleteSync } from '@/features/utilities/hooks/useDeleteSync'
import type { IntervalConfig } from '@root/schemas/scheduler/scheduler.schema'
import type { DeleteSyncFormValues } from '@/features/utilities/hooks/useDeleteSync'

export function DeleteSyncForm() {
  const {
    form,
    error,
    isDryRunLoading,
    dryRunError,
    isSaving,
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
    handleTimeChange
  } = useDeleteSync()

  // Brute force solution: add a local saving state that we control
  const [isLocalSaving, setIsLocalSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Force the buttons to stay visible for a full 500ms when saving
  const handleSubmit = async (data: DeleteSyncFormValues) => {
    setIsLocalSaving(true);
    
    try {
      await onSubmit(data);
    } catch (error) {
      console.error("Error in form submission:", error);
    }
    
    // This ensures the button stays visible for at least 500ms
    setTimeout(() => {
      setIsLocalSaving(false);
    }, 500);
  };
  
  // Same for cancel - keep it visible for 500ms
  const handleCancelWithDuration = () => {
    setIsCancelling(true);
    handleCancel();
    setTimeout(() => {
      setIsCancelling(false);
    }, 500);
  };
  
  // Track the dirty state separately to force button visibility 
  const [formWasDirty, setFormWasDirty] = useState(false);
  
  useEffect(() => {
    // If form becomes dirty, record that
    if (form.formState.isDirty) {
      setFormWasDirty(true);
    }
  }, [form.formState.isDirty]);
  
  // Only hide buttons 500ms after form is reset
  useEffect(() => {
    if (!form.formState.isDirty && formWasDirty && !isLocalSaving && !isCancelling) {
      // Delay hiding the buttons
      const timer = setTimeout(() => {
        setFormWasDirty(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [form.formState.isDirty, formWasDirty, isLocalSaving, isCancelling]);
  
  // Calculate if buttons should be visible
  const showButtons = form.formState.isDirty || formWasDirty || isLocalSaving || isCancelling;

  return (
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
              className={cn(
                'px-2 py-0.5 h-7 text-sm ml-2',
                deleteSyncJob?.enabled 
                  ? 'bg-green-500 hover:bg-green-500 text-white' 
                  : deleteSyncJob?.last_run?.status === 'failed'
                    ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
                    : 'bg-red-500 hover:bg-red-500 text-white'
              )}
            >
              {!deleteSyncJob 
                ? 'Unknown' 
                : !deleteSyncJob.enabled 
                  ? 'Stopped' 
                  : deleteSyncJob.last_run?.status === 'failed'
                    ? 'Failed'
                    : 'Running'
              }
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
                  <h3 className="font-medium text-text mb-2">Status</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h3 className="font-medium text-sm text-text mb-1">Status</h3>
                      <p className="font-medium text-text">
                        {deleteSyncJob?.enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-text mb-1">Last Run</h3>
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
                      <h3 className="font-medium text-sm text-text mb-1">Next Scheduled Run</h3>
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
                          />
                        </div>
                      )}
                    />
                  </div>
                  {deleteSyncJob && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {deleteSyncJob.type === 'cron' && deleteSyncJob.config?.expression && (
                        <p>Current schedule: {
                          deleteSyncJob.config.expression === '0 0 * * * *' 
                            ? 'Every hour'
                            : `${format(scheduleTime || new Date(), 'h:mm a')} ${
                                dayOfWeek === '*' 
                                  ? 'every day' 
                                  : `on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(dayOfWeek)]}`
                              }`
                        }</p>
                      )}
                      {deleteSyncJob.type === 'interval' && (
                        <p>
                          Current interval: {(() => {
                            const config = deleteSyncJob.config as IntervalConfig
                            const parts = []
                            
                            if (config.days) parts.push(`${config.days} day${config.days !== 1 ? 's' : ''}`)
                            if (config.hours) parts.push(`${config.hours} hour${config.hours !== 1 ? 's' : ''}`)
                            if (config.minutes) parts.push(`${config.minutes} minute${config.minutes !== 1 ? 's' : ''}`)
                            if (config.seconds) parts.push(`${config.seconds} second${config.seconds !== 1 ? 's' : ''}`)
                            
                            return parts.length ? `Every ${parts.join(', ')}` : 'Custom interval'
                          })()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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

                    {/* Action buttons - ALWAYS SHOW DURING LOADING STATE */}
                    <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border">
                      {showButtons && (
                        <>
                          <Button
                            type="submit"
                            disabled={(isLocalSaving || isSaving) || (!form.formState.isDirty && !formWasDirty)}
                            className={cn(
                              "flex items-center gap-2",
                              "bg-blue hover:bg-blue/90"
                            )}
                          >
                            {(isLocalSaving || isSaving) ? (
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
                            onClick={handleCancelWithDuration}
                            disabled={isLocalSaving || isSaving || isCancelling}
                            className="flex items-center gap-1"
                          >
                            <span>Cancel</span>
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
  )
}