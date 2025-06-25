import { useEffect } from 'react'
import { useApprovalConfiguration } from '@/features/plex/hooks/useApprovalConfiguration'
import { useApprovalScheduler } from '@/features/plex/hooks/useApprovalScheduler'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { z } from 'zod'
import { ConfigSchema } from '@root/schemas/config/config.schema'

// Define the form data type that includes both config and schedule fields
const approvalConfigurationSchema = z.object({
  approvalExpiration: ConfigSchema.shape.approvalExpiration,
  quotaSettings: ConfigSchema.shape.quotaSettings,
  approvalNotify: ConfigSchema.shape.approvalNotify,
  scheduleInterval: z.number().min(1).max(12).optional(),
  scheduleTime: z.date().optional(),
  dayOfWeek: z.string().optional(),
})

type ApprovalConfigurationFormData = z.infer<typeof approvalConfigurationSchema>

/**
 * Main Approval System Hook
 *
 * Combines form management and scheduler functionality for the approval system.
 * Follows the utilities pattern of composing specialized hooks into a main interface.
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
          '/v1/scheduler/schedules/approval-maintenance',
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
        // Don't throw the error to avoid confusing users about the save status
        console.error('Schedule update failed after successful config save:', err)
        // Consider showing a non-blocking warning to the user about the schedule update failure
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
