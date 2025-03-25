import { useState, useEffect, useCallback, useRef } from 'react'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
import { useForm } from 'react-hook-form'
import { useToast } from '@/hooks/use-toast'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { formatDistanceToNow, parseISO } from 'date-fns'

// Minimum loading time for consistent UI
const MIN_LOADING_DELAY = 500;

// Schema for delete sync form
export const deleteSyncSchema = z.object({
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

export type DeleteSyncFormValues = z.infer<typeof deleteSyncSchema>

export function useDeleteSync() {
  const { toast } = useToast()
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
  const [isRunningJob, setIsRunningJob] = useState(false)
  const [scheduleTime, setScheduleTime] = useState<Date | undefined>(undefined)
  const [dayOfWeek, setDayOfWeek] = useState<string>('*')
  
  // This will only be true during the initial component mount
  const [isFirstMount, setIsFirstMount] = useState(true)
  // Track if data has been loaded at least once
  const hasLoadedData = useRef(false)

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

  // Set isFirstMount to false after initial minimum loading time
  useEffect(() => {
    if (isFirstMount) {
      const timer = setTimeout(() => {
        setIsFirstMount(false);
      }, MIN_LOADING_DELAY);
      
      return () => clearTimeout(timer);
    }
  }, [isFirstMount]);
  
  // Get the delete-sync job from schedules
  const getDeleteSyncJob = useCallback(() => {
    if (!schedules) return null
    return schedules.find(job => job.name === 'delete-sync')
  }, [schedules])

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
      }, { keepDirty: false })
    }
  }, [config, form, scheduleTime, dayOfWeek])

  // Load schedules when component mounts
  useEffect(() => {
    if (!schedules) {
      fetchSchedules()
        .then(() => {
          hasLoadedData.current = true;
        })
        .catch(console.error);
    } else {
      hasLoadedData.current = true;
    }
  }, [schedules, fetchSchedules])

  // Function to run dry delete sync
  const handleDryRun = async () => {
    setIsDryRunLoading(true)
    setDryRunError(null)
    try {
      await runDryDeleteSync()
      toast({
        description: "Dry run completed successfully",
        variant: "default"
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run dry run'
      setDryRunError(errorMessage)
      toast({
        title: "Dry Run Failed",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsDryRunLoading(false)
    }
  }

  // Function to run the delete-sync job
  const handleRunNow = async () => {
    setIsRunningJob(true)
    try {
      const success = await runScheduleNow('delete-sync')
      if (success) {
        toast({
          description: "Delete sync job started successfully",
          variant: "default"
        })
      } else {
        throw new Error("Failed to start job")
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run job'
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsRunningJob(false)
    }
  }

  // Function to toggle the delete-sync job status
  const handleToggleStatus = async () => {
    if (!deleteSyncJob) return
    
    setIsTogglingStatus(true)
    try {
      const success = await toggleScheduleStatus('delete-sync', !deleteSyncJob.enabled)
      if (success) {
        toast({
          description: `Delete sync service ${deleteSyncJob.enabled ? "stopped" : "started"} successfully`,
          variant: "default"
        })
      } else {
        throw new Error("Failed to toggle status")
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle status'
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsTogglingStatus(false)
    }
  }
  
  // Function to handle saving configuration
  const onSubmit = async (data: DeleteSyncFormValues) => {
    setIsSaving(true)
    try {
      // Update config settings
      await updateConfig({
        deleteMovie: data.deleteMovie,
        deleteEndedShow: data.deleteEndedShow,
        deleteContinuingShow: data.deleteContinuingShow,
        deleteFiles: data.deleteFiles,
        respectUserSyncSetting: data.respectUserSyncSetting,
        deleteSyncNotify: data.deleteSyncNotify,
        maxDeletionPrevention: data.maxDeletionPrevention
      })
      
      // Save schedule time if changed and if we have a job ID
      if (data.scheduleTime && deleteSyncJob) {
        const hours = data.scheduleTime.getHours();
        const minutes = data.scheduleTime.getMinutes();
        const dayOfWeek = data.dayOfWeek || '*';
        
        // Create cron expression (seconds minutes hours day month weekday)
        // Using * for day, month and setting the weekday
        const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`;
        
        // Update the schedule through the correct API endpoint
        await fetch(`/v1/scheduler/schedules/delete-sync`, {
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
        });
        
        await fetchSchedules();
      }
      
      // Ensure form is cleaned up after successful save
      form.reset({
        ...data,
        scheduleTime: data.scheduleTime,
        dayOfWeek: data.dayOfWeek
      }, { keepDirty: false })
      
      toast({
        description: "Settings saved successfully",
        variant: "default"
      })
    } catch (error) {
      console.error('Failed to save configuration:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings'
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Function to cancel form changes
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

  // Format last run time with proper handling
  const formatLastRun = (lastRun: JobStatus['last_run'] | null | undefined) => {
    if (!lastRun?.time) return 'Never'
    
    try {
      return formatDistanceToNow(parseISO(lastRun.time), { addSuffix: true })
    } catch (e) {
      return lastRun.time
    }
  }

  // Format next run time with proper handling
  const formatNextRun = (nextRun: JobStatus['next_run'] | null | undefined) => {
    if (!nextRun?.time) return 'Not scheduled'
    
    try {
      return formatDistanceToNow(parseISO(nextRun.time), { addSuffix: true })
    } catch (e) {
      return nextRun.time
    }
  }

  // Calculate isLoading based on first mount and data status only
  // This ensures we only show skeleton on first mount, not during page switches
  const isLoading = isFirstMount || (loading.schedules && !hasLoadedData.current);

  return {
    // State
    form,
    isLoading,
    error: error.schedules,
    isDryRunLoading,
    dryRunError,
    isSaving,
    isTogglingStatus,
    isRunningJob,
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,
    // Helper functions
    formatLastRun,
    formatNextRun,
    // Actions
    handleDryRun,
    handleRunNow,
    handleToggleStatus,
    onSubmit,
    handleCancel,
    handleTimeChange
  }
}