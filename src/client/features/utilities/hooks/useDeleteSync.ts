import { useState, useEffect, useCallback, useRef } from 'react'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
import { useForm } from 'react-hook-form'
import { useToast } from '@/hooks/use-toast'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { formatDistanceToNow, parseISO } from 'date-fns'

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

// Status type that mimics your other components
type SaveStatus = 'idle' | 'loading' | 'success' | 'error';

export function useDeleteSync() {
  const { toast } = useToast()
  const { 
    schedules, 
    loading,
    error,
    fetchSchedules, 
    runDryDeleteSync,
    runScheduleNow,
    toggleScheduleStatus,
    setLoadingWithMinDuration
  } = useUtilitiesStore()
  
  const { config, updateConfig } = useConfigStore()
  
  const [isDryRunLoading, setIsDryRunLoading] = useState(false)
  const [dryRunError, setDryRunError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle') // Mimicking your pattern
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [isRunningJob, setIsRunningJob] = useState(false)
  const [scheduleTime, setScheduleTime] = useState<Date | undefined>(undefined)
  const [dayOfWeek, setDayOfWeek] = useState<string>('*')
  
  // This ref tracks if we've completed the initial load
  const hasInitializedRef = useRef(false)

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
    const loadData = async () => {
      if (!schedules && !loading.schedules) {
        try {
          await fetchSchedules();
          // Data is loaded now
        } catch (error) {
          console.error("Failed to fetch schedules:", error);
        }
      }
      
      // After a minimum delay, mark initialization as complete
      const timer = setTimeout(() => {
        hasInitializedRef.current = true;
      }, 500);
      
      return () => clearTimeout(timer);
    };
    
    loadData();
  }, [schedules, loading.schedules, fetchSchedules]);

  // Function to run dry delete sync with minimum loading time
  const handleDryRun = async () => {
    setIsDryRunLoading(true)
    setDryRunError(null)
    
    try {
      // Create a minimum loading time promise
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500));
      
      // Run operations in parallel
      await Promise.all([
        runDryDeleteSync(),
        minimumLoadingTime
      ]);
      
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

  // Function to run the delete-sync job with minimum loading time
  const handleRunNow = async () => {
    setIsRunningJob(true)
    
    try {
      // Create a minimum loading time promise
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500));
      
      // Run operations in parallel and wait for both
      const [success] = await Promise.all([
        runScheduleNow('delete-sync'),
        minimumLoadingTime
      ]);
      
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

  // Function to toggle the delete-sync job status with minimum loading time
  const handleToggleStatus = async () => {
    if (!deleteSyncJob) return
    
    setIsTogglingStatus(true)
    
    try {
      // Create a minimum loading time promise
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500));
      
      // Run operations in parallel and wait for both
      const [success] = await Promise.all([
        toggleScheduleStatus('delete-sync', !deleteSyncJob.enabled),
        minimumLoadingTime
      ]);
      
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
  
  // Function to handle saving configuration with minimum loading time
  const onSubmit = async (data: DeleteSyncFormValues) => {
    // Exactly mimicking your pattern in other components
    setSaveStatus('loading')
    setLoadingWithMinDuration(true)
    
    try {
      // Create minimum loading time promise
      const minimumLoadingTime = new Promise(resolve => 
        setTimeout(resolve, 500)
      );
      
      // Set up update operations
      const updateConfig1 = updateConfig({
        deleteMovie: data.deleteMovie,
        deleteEndedShow: data.deleteEndedShow,
        deleteContinuingShow: data.deleteContinuingShow,
        deleteFiles: data.deleteFiles,
        respectUserSyncSetting: data.respectUserSyncSetting,
        deleteSyncNotify: data.deleteSyncNotify,
        maxDeletionPrevention: data.maxDeletionPrevention
      });
      
      // Initialize schedule update promise
      let scheduleUpdate = Promise.resolve();
      
      // Save schedule time if changed and if we have a job ID
      if (data.scheduleTime && deleteSyncJob) {
        const hours = data.scheduleTime.getHours();
        const minutes = data.scheduleTime.getMinutes();
        const dayOfWeek = data.dayOfWeek || '*';
        
        // Create cron expression (seconds minutes hours day month weekday)
        // Using * for day, month and setting the weekday
        const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`;
        
        // Update the schedule through the correct API endpoint
        scheduleUpdate = fetch(`/v1/scheduler/schedules/delete-sync`, {
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
        }).then(response => {
          if (!response.ok) {
            throw new Error('Failed to update schedule');
          }
          return fetchSchedules();
        });
      }
      
      // Run all operations in parallel, including the minimum loading time
      await Promise.all([
        updateConfig1, 
        scheduleUpdate,
        minimumLoadingTime
      ]);
      
      // Ensure form is cleaned up after successful save
      form.reset({
        ...data,
        scheduleTime: data.scheduleTime,
        dayOfWeek: data.dayOfWeek
      }, { keepDirty: false });
      
      setSaveStatus('success')
      toast({
        description: "Settings saved successfully",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to save configuration:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings';
      
      setSaveStatus('error')
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      // Exactly mimicking your pattern from other components
      setLoadingWithMinDuration(false)
      setSaveStatus('idle')
    }
  };

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

  // Only show loading skeleton on initial load, not on navigation
  const isLoading = !hasInitializedRef.current && (loading.schedules || !schedules);

  return {
    // State
    form,
    isLoading,
    error: error.schedules,
    isDryRunLoading,
    dryRunError,
    isSaving: saveStatus === 'loading' || loading.saveSettings, // Use saveStatus like other components
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