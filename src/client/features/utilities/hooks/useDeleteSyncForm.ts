import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import * as z from 'zod'
import type { Config } from '@root/types/config.types'

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
export type FormSaveStatus = 'idle' | 'loading' | 'success' | 'error'

export function useDeleteSyncForm() {
  const { toast } = useToast()
  const { config, updateConfig } = useConfigStore()
  const { setLoadingWithMinDuration } = useUtilitiesStore()
  const [saveStatus, setSaveStatus] = useState<FormSaveStatus>('idle')
  
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
        scheduleTime: form.getValues('scheduleTime'),
        dayOfWeek: form.getValues('dayOfWeek')
      }, { keepDirty: false })
    }
  }, [config, form])

  // Function to handle saving configuration with minimum loading time
  const onSubmit = async (data: DeleteSyncFormValues) => {
    // Start loading state - don't reset form yet
    setSaveStatus('loading')
    setLoadingWithMinDuration(true)
    
    try {
      // Create minimum loading time promise
      const minimumLoadingTime = new Promise(resolve => 
        setTimeout(resolve, 500)
      );
      
      // Set up update operations
      const updateConfigPromise = updateConfig({
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
      
      // Save schedule time if changed
      if (data.scheduleTime) {
        const hours = data.scheduleTime.getHours();
        const minutes = data.scheduleTime.getMinutes();
        const dayOfWeek = data.dayOfWeek || '*';
        
        // Create cron expression (seconds minutes hours day month weekday)
        const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`;
        
        // Update the schedule through the API endpoint
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
          return;
        });
      }
      
      // Run all operations in parallel, including the minimum loading time
      await Promise.all([
        updateConfigPromise, 
        scheduleUpdate,
        minimumLoadingTime
      ]);
      
      // Important: We wait until after API calls complete to set success state
      setSaveStatus('success')
      
      // Get latest config to prevent flickering
      const updatedConfig = useConfigStore.getState().config || config || {} as Config;
      
      // Ensure form is reset with the NEW values received from the API
      // This prevents flickering back to old values
      form.reset({
        deleteMovie: updatedConfig.deleteMovie || false,
        deleteEndedShow: updatedConfig.deleteEndedShow || false,
        deleteContinuingShow: updatedConfig.deleteContinuingShow || false,
        deleteFiles: updatedConfig.deleteFiles || false,
        respectUserSyncSetting: updatedConfig.respectUserSyncSetting ?? true,
        deleteSyncNotify: updatedConfig.deleteSyncNotify || 'none',
        maxDeletionPrevention: updatedConfig.maxDeletionPrevention,
        scheduleTime: data.scheduleTime, 
        dayOfWeek: data.dayOfWeek
      }, { keepDirty: false });
      
      toast({
        description: "Settings saved successfully",
        variant: "default"
      });
      
      // Don't set to idle state immediately to prevent flicker
      // Let success state show for a moment
      setTimeout(() => {
        setSaveStatus('idle');
      }, 500);
    } catch (error) {
      console.error('Failed to save configuration:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings';
      
      setSaveStatus('error');
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      
      setTimeout(() => {
        setSaveStatus('idle');
      }, 1000);
    } finally {
      // This matches your other components - don't change form state in finally block
      setLoadingWithMinDuration(false);
    }
  };

  // Function to cancel form changes
  const handleCancel = useCallback(() => {
    if (config) {
      form.reset({
        deleteMovie: config.deleteMovie || false,
        deleteEndedShow: config.deleteEndedShow || false,
        deleteContinuingShow: config.deleteContinuingShow || false,
        deleteFiles: config.deleteFiles || false,
        respectUserSyncSetting: config.respectUserSyncSetting ?? true,
        deleteSyncNotify: config.deleteSyncNotify || 'none',
        maxDeletionPrevention: config.maxDeletionPrevention,
        scheduleTime: form.getValues('scheduleTime'),
        dayOfWeek: form.getValues('dayOfWeek')
      })
    }
  }, [config, form])

  // Handler for time input changes
  const handleTimeChange = useCallback((newTime: Date, newDay?: string) => {
    form.setValue('scheduleTime', newTime, { shouldDirty: true });
    if (newDay !== undefined) {
      form.setValue('dayOfWeek', newDay, { shouldDirty: true });
    }
  }, [form])

  return {
    form,
    saveStatus,
    isSaving: saveStatus === 'loading',
    onSubmit,
    handleCancel,
    handleTimeChange
  }
}