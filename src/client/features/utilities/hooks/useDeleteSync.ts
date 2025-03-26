import { useRef } from 'react'
import { useDeleteSyncForm } from '@/features/utilities/hooks/useDeleteSyncForm'
import { useDeleteSyncSchedule } from '@/features/utilities/hooks/useDeleteSyncSchedule'
import { useDeleteSyncActions } from '@/features/utilities/hooks/useDeleteSyncActions'

/**
 * Combines deletion sync logic from form, schedule, and action hooks.
 *
 * This custom hook integrates state management and handler functions from three specialized hooks:
 * - Form management for handling submissions, cancellations, and time input changes.
 * - Scheduling management for tracking sync job timing, errors, and deletion actions.
 * - Action management for executing dry runs, initiating jobs, and toggling job status.
 *
 * It also computes a loading state to prevent displaying a loading indicator during navigation.
 *
 * @returns An object containing:
 *  - Form state: form, isSaving, submittedValues.
 *  - Schedule state: isLoading, error, scheduleTime, dayOfWeek, deleteSyncJob.
 *  - Action state: isDryRunLoading, dryRunError, isTogglingStatus, isRunningJob, pendingEnable.
 *  - Form methods: onSubmit, handleCancel, handleTimeChange.
 *  - Action methods: handleDryRun, initiateRunJob, handleRunNow, initiateToggleStatus, handleToggleStatus.
 *  - Modal controls: setShowEnableConfirmation, setShowRunConfirmation, setShowDryRunModal.
 *  - Utility formatters: formatLastRun, formatNextRun.
 */
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
