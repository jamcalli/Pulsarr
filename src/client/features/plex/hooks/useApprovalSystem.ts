import { useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  type ApprovalConfigurationFormData,
  useApprovalConfiguration,
} from '@/features/plex/hooks/useApprovalConfiguration'
import { useApprovalScheduler } from '@/features/plex/hooks/useApprovalScheduler'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

/**
 * Combines approval configuration form management with scheduling controls in a single React hook.
 *
 * Synchronizes the approval schedule interval between the configuration form and the scheduler, ensuring consistency. Handles saving configuration changes, updating the approval maintenance schedule on the server, and notifies users if schedule updates fail. Returns an object with unified form state, scheduler state, and related actions for use in approval system interfaces.
 *
 * @returns An object containing approval configuration form state and methods, along with scheduling controls and status.
 */
export function useApprovalSystem() {
  // Form management hook for business logic configuration
  const formHook = useApprovalConfiguration()

  // Scheduler management hook for operational controls
  const scheduleHook = useApprovalScheduler()

  // Utilities store for schedule management
  const { fetchSchedules } = useUtilitiesStore()

  // Sync scheduler data into form when it changes
  useEffect(() => {
    if (scheduleHook.approvalInterval !== null && formHook.form) {
      const currentFormInterval = formHook.form.getValues('scheduleInterval')
      if (currentFormInterval !== scheduleHook.approvalInterval) {
        // Get all current form values
        const currentValues = formHook.form.getValues()
        // Update with the scheduler interval
        const updatedValues = {
          ...currentValues,
          scheduleInterval: scheduleHook.approvalInterval,
        }
        // Reset the form with the updated values to clear dirty state
        formHook.form.reset(updatedValues)
      }
    }
  }, [scheduleHook.approvalInterval, formHook.form])

  // Custom onSubmit that handles both config and schedule updates
  // This delegates to formHook.onSubmit for proper state management
  const handleSubmit = async (data: ApprovalConfigurationFormData) => {
    // Use formHook.onSubmit which handles all the FormSaveStatus pattern properly
    await formHook.onSubmit(data)

    // After config is saved, handle schedule update if needed
    if (
      data.scheduleInterval &&
      data.scheduleInterval !== scheduleHook.approvalInterval
    ) {
      try {
        const cronExpression = `0 */${data.scheduleInterval} * * *`

        const response = await fetch(
          api('/v1/scheduler/schedules/approval-maintenance'),
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'cron',
              config: { expression: cronExpression },
              enabled: true,
            }),
          },
        )

        if (!response.ok) {
          throw new Error('Failed to update approval maintenance schedule')
        }

        // Update local state and refresh schedules
        scheduleHook.handleApprovalIntervalChange(data.scheduleInterval)
        await fetchSchedules()
      } catch (err) {
        // Schedule update failed, but config was already saved successfully
        console.error(
          'Schedule update failed after successful config save:',
          err,
        )
        // Show a non-blocking warning to the user about the schedule update failure
        toast(
          'Configuration saved successfully, but the schedule update failed. Please try updating the schedule separately.',
        )
      }
    }
  }

  return {
    // Schedule management (operational controls)
    approvalMaintenanceJob: scheduleHook.approvalMaintenanceJob,
    isLoading: scheduleHook.isLoading,
    schedulerError: scheduleHook.schedulerError,
    toggleApprovalSchedule: scheduleHook.toggleApprovalSchedule,
    runApprovalNow: scheduleHook.runApprovalNow,
    isTogglingApproval: scheduleHook.isTogglingApproval,
    isRunningApproval: scheduleHook.isRunningApproval,
    formatLastRun: scheduleHook.formatLastRun,
    formatNextRun: scheduleHook.formatNextRun,

    // Schedule configuration
    approvalInterval: scheduleHook.approvalInterval,
    handleApprovalIntervalChange: scheduleHook.handleApprovalIntervalChange,
    saveApprovalSchedule: scheduleHook.saveApprovalSchedule,

    // Form management (business logic) - with custom submit handler
    form: formHook.form,
    isSaving: formHook.isSaving,
    saveStatus: formHook.saveStatus,
    submittedValues: formHook.submittedValues,
    onSubmit: handleSubmit,
    handleCancel: formHook.handleCancel,
    hasChanges: formHook.hasChanges,
    error: formHook.error,
  }
}
