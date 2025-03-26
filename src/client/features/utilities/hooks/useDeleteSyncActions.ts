import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

export function useDeleteSyncActions() {
  const { toast } = useToast()
  const { runDryDeleteSync, runScheduleNow, toggleScheduleStatus } =
    useUtilitiesStore()

  const [isDryRunLoading, setIsDryRunLoading] = useState(false)
  const [dryRunError, setDryRunError] = useState<string | null>(null)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [isRunningJob, setIsRunningJob] = useState(false)

  // Confirmation modal states
  const [showEnableConfirmation, setShowEnableConfirmation] = useState(false)
  const [showRunConfirmation, setShowRunConfirmation] = useState(false)
  const [pendingEnable, setPendingEnable] = useState<boolean | null>(null)

  // Dry run modal state
  const [showDryRunModal, setShowDryRunModal] = useState(false)

  // Toggle the delete-sync job status with minimum loading time
  const handleToggleStatus = useCallback(
    async (enabled: boolean) => {
      setIsTogglingStatus(true)
      setShowEnableConfirmation(false)

      try {
        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Run operations in parallel and wait for both
        const [success] = await Promise.all([
          toggleScheduleStatus('delete-sync', !enabled),
          minimumLoadingTime,
        ])

        if (success) {
          toast({
            description: `Delete sync service ${enabled ? 'stopped' : 'started'} successfully`,
            variant: 'default',
          })
        } else {
          throw new Error('Failed to toggle status')
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to toggle status'
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        })
      } finally {
        setIsTogglingStatus(false)
      }
    },
    [toast, toggleScheduleStatus],
  )

  // Function to initiate toggle confirmation - only when enabling
  const initiateToggleStatus = useCallback(
    (enabled: boolean) => {
      // If already enabled, disable without confirmation
      if (enabled) {
        handleToggleStatus(enabled)
        return
      }

      // Only show confirmation when enabling (when enabled is currently false)
      setPendingEnable(true)
      setShowEnableConfirmation(true)
    },
    [handleToggleStatus],
  )

  // Function to run the delete-sync job with minimum loading time
  const handleRunNow = useCallback(async () => {
    setIsRunningJob(true)
    setShowRunConfirmation(false)

    try {
      // Create a minimum loading time promise
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Run operations in parallel and wait for both
      const [success] = await Promise.all([
        runScheduleNow('delete-sync'),
        minimumLoadingTime,
      ])

      if (success) {
        toast({
          description: 'Delete sync job started successfully',
          variant: 'default',
        })
      } else {
        throw new Error('Failed to start job')
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to run job'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsRunningJob(false)
    }
  }, [toast, runScheduleNow])

  // Function to initiate run confirmation
  const initiateRunJob = useCallback(() => {
    setShowRunConfirmation(true)
  }, [])

  // Function to run dry delete sync and open the modal
  const handleDryRun = useCallback(async () => {
    setIsDryRunLoading(true)
    setDryRunError(null)
    setShowDryRunModal(true)

    try {
      // Start dry run process - no need for minimum loading time
      // as we're showing progress in the modal
      await runDryDeleteSync()

      toast({
        description: 'Dry run completed successfully',
        variant: 'default',
      })
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to run dry run'
      setDryRunError(errorMessage)
      toast({
        title: 'Dry Run Failed',
        description: errorMessage,
        variant: 'destructive',
      })
      // Close the modal on error after a short delay
      setTimeout(() => {
        setShowDryRunModal(false)
      }, 1000)
    } finally {
      setIsDryRunLoading(false)
    }
  }, [toast, runDryDeleteSync])

  return {
    isDryRunLoading,
    dryRunError,
    isTogglingStatus,
    isRunningJob,
    showEnableConfirmation,
    showRunConfirmation,
    showDryRunModal,
    pendingEnable,
    setShowEnableConfirmation,
    setShowRunConfirmation,
    setShowDryRunModal,
    handleDryRun,
    initiateRunJob,
    handleRunNow,
    initiateToggleStatus,
    handleToggleStatus,
  }
}
