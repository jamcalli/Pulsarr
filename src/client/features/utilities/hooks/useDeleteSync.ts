import { useRef } from 'react'
import { useDeleteSyncForm } from '@/features/utilities/hooks/useDeleteSyncForm'
import { useDeleteSyncSchedule } from '@/features/utilities/hooks/useDeleteSyncSchedule'
import { useDeleteSyncActions } from '@/features/utilities/hooks/useDeleteSyncActions'

// This hook combines the functionality of the three specialized hooks
export function useDeleteSync() {
  const hasInitializedRef = useRef(false)

  const {
    form,
    isSaving,
    submittedValues,
    onSubmit,
    handleCancel,
    handleTimeChange,
  } = useDeleteSyncForm()

  const {
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,
    isLoading: isScheduleLoading,
    error,
    formatLastRun,
    formatNextRun,
  } = useDeleteSyncSchedule()

  const {
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
  } = useDeleteSyncActions()

  // Check if on initial loading - don't show loading on navigation
  if (!hasInitializedRef.current && !isScheduleLoading) {
    hasInitializedRef.current = true
  }

  // Only show loading skeleton on initial load, not on navigation
  const isLoading = !hasInitializedRef.current && isScheduleLoading

  return {
    // Form state
    form,
    isSaving,
    submittedValues,

    // Schedule state
    isLoading,
    error,
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,

    // Action state
    isDryRunLoading,
    dryRunError,
    isTogglingStatus,
    isRunningJob,
    showEnableConfirmation,
    showRunConfirmation,
    showDryRunModal,
    pendingEnable,

    // Form methods
    onSubmit,
    handleCancel,
    handleTimeChange,

    // Action methods
    handleDryRun,
    initiateRunJob,
    handleRunNow,
    initiateToggleStatus: () => {
      if (!deleteSyncJob) return
      return initiateToggleStatus(deleteSyncJob.enabled)
    },
    handleToggleStatus,

    // Modal control
    setShowEnableConfirmation,
    setShowRunConfirmation,
    setShowDryRunModal,

    // Utility formatters
    formatLastRun,
    formatNextRun,
  }
}
