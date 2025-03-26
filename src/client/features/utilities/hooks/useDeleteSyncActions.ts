import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

export function useDeleteSyncActions() {
  const { toast } = useToast()
  const { 
    runDryDeleteSync,
    runScheduleNow,
    toggleScheduleStatus,
  } = useUtilitiesStore()
  
  const [isDryRunLoading, setIsDryRunLoading] = useState(false)
  const [dryRunError, setDryRunError] = useState<string | null>(null)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [isRunningJob, setIsRunningJob] = useState(false)

  // Function to run dry delete sync with minimum loading time
  const handleDryRun = useCallback(async () => {
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
  }, [toast, runDryDeleteSync])

  // Function to run the delete-sync job with minimum loading time
  const handleRunNow = useCallback(async () => {
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
  }, [toast, runScheduleNow])

  // Function to toggle the delete-sync job status with minimum loading time
  const handleToggleStatus = useCallback(async (enabled: boolean) => {
    setIsTogglingStatus(true)
    
    try {
      // Create a minimum loading time promise
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500));
      
      // Run operations in parallel and wait for both
      const [success] = await Promise.all([
        toggleScheduleStatus('delete-sync', !enabled),
        minimumLoadingTime
      ]);
      
      if (success) {
        toast({
          description: `Delete sync service ${enabled ? "stopped" : "started"} successfully`,
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
  }, [toast, toggleScheduleStatus])

  return {
    isDryRunLoading,
    dryRunError,
    isTogglingStatus,
    isRunningJob,
    handleDryRun,
    handleRunNow,
    handleToggleStatus
  }
}