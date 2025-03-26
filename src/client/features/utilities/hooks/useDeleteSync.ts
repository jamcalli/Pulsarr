import { useRef } from 'react'
import { useDeleteSyncForm } from './useDeleteSyncForm'
import { useDeleteSyncSchedule } from './useDeleteSyncSchedule'
import { useDeleteSyncActions } from './useDeleteSyncActions'

// This hook combines the functionality of the three specialized hooks
// for a convenient API that can be used in components
export function useDeleteSync() {
  const hasInitializedRef = useRef(false)
  
  const {
    form,
    isSaving,
    onSubmit,
    handleCancel,
    handleTimeChange
  } = useDeleteSyncForm()
  
  const {
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,
    isLoading: isScheduleLoading,
    error,
    formatLastRun,
    formatNextRun
  } = useDeleteSyncSchedule()
  
  const {
    isDryRunLoading,
    dryRunError,
    isTogglingStatus,
    isRunningJob,
    handleDryRun,
    handleRunNow,
    handleToggleStatus
  } = useDeleteSyncActions()
  
  // Check if we're on initial loading - don't show loading on navigation
  if (!hasInitializedRef.current && !isScheduleLoading) {
    hasInitializedRef.current = true
  }
  
  // Only show loading skeleton on initial load, not on navigation
  const isLoading = !hasInitializedRef.current && isScheduleLoading;

  return {
    // Form state
    form,
    isSaving,
    
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
    
    // Form methods
    onSubmit,
    handleCancel,
    handleTimeChange,
    
    // Action methods
    handleDryRun,
    handleRunNow,
    handleToggleStatus: () => {
      if (!deleteSyncJob) return;
      return handleToggleStatus(deleteSyncJob.enabled);
    },
    
    // Utility formatters
    formatLastRun,
    formatNextRun
  }
}