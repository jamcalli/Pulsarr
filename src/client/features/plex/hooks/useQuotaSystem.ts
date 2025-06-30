import { useEffect } from 'react'
import { toast } from 'sonner'
import { useApprovalConfiguration } from '@/features/plex/hooks/useApprovalConfiguration'
import { useApprovalScheduler } from '@/features/plex/hooks/useApprovalScheduler'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { z } from 'zod'
import { ConfigSchema } from '@root/schemas/config/config.schema'

// Define the form data type that includes both config and schedule fields
const approvalConfigurationSchema = z.object({
  approvalExpiration: ConfigSchema.shape.approvalExpiration,
  quotaSettings: ConfigSchema.shape.quotaSettings,
  scheduleInterval: z.number().min(1).max(12).optional(),
  scheduleTime: z.date().optional(),
  dayOfWeek: z.string().optional(),
})

type ApprovalConfigurationFormData = z.infer<typeof approvalConfigurationSchema>

/**
 * Provides a unified hook for managing quota approval configuration and scheduled quota maintenance.
 *
 * Synchronizes schedule-related form fields with the current scheduler state, coordinates saving of both configuration and schedule updates, and exposes combined state, handlers, and status flags for quota system management. Notifies the user if schedule updates fail after a successful configuration save.
 *
 * @returns An object containing state, handlers, and status flags for both quota approval configuration and quota maintenance scheduling.
 */
export function useQuotaSystem() {
  // Form management hook for business logic configuration
  const formHook = useApprovalConfiguration()

  // Scheduler management hook for operational controls
  const scheduleHook = useApprovalScheduler()

  // Utilities store for schedule management
  const { fetchSchedules } = useUtilitiesStore()

  // Sync scheduler data into form when it changes
  useEffect(() => {
    if (scheduleHook.quotaScheduleTime && formHook.form) {
      const currentFormTime = formHook.form.getValues('scheduleTime')
      const currentFormDay = formHook.form.getValues('dayOfWeek')

      // Update time if different
      if (
        !currentFormTime ||
        currentFormTime.getTime() !== scheduleHook.quotaScheduleTime.getTime()
      ) {
        formHook.form.setValue('scheduleTime', scheduleHook.quotaScheduleTime, {
          shouldDirty: false,
        })
      }

      // Update day if different
      if (currentFormDay !== scheduleHook.quotaDayOfWeek) {
        formHook.form.setValue('dayOfWeek', scheduleHook.quotaDayOfWeek, {
          shouldDirty: false,
        })
      }
    }
  }, [
    scheduleHook.quotaScheduleTime,
    scheduleHook.quotaDayOfWeek,
    formHook.form,
  ])

  // Custom onSubmit that handles both config and schedule updates
  // This delegates to formHook.onSubmit for proper state management
  const handleSubmit = async (data: ApprovalConfigurationFormData) => {
    // Use formHook.onSubmit which handles all the FormSaveStatus pattern properly
    await formHook.onSubmit(data)

    // After config is saved, handle schedule update if needed
    const timeChanged =
      data.scheduleTime &&
      (!scheduleHook.quotaScheduleTime ||
        data.scheduleTime.getTime() !==
          scheduleHook.quotaScheduleTime.getTime())
    const dayChanged =
      data.dayOfWeek && data.dayOfWeek !== scheduleHook.quotaDayOfWeek

    if ((timeChanged || dayChanged) && data.scheduleTime && data.dayOfWeek) {
      try {
        // Generate cron expression directly like delete sync does
        const hour = data.scheduleTime.getHours()
        const minute = data.scheduleTime.getMinutes()
        const cronExpression = `${minute} ${hour} * * ${data.dayOfWeek}`

        const response = await fetch(
          '/v1/scheduler/schedules/quota-maintenance',
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
          throw new Error('Failed to update quota maintenance schedule')
        }

        // Update local state and refresh schedules
        scheduleHook.handleQuotaTimeChange(data.scheduleTime, data.dayOfWeek)
        await fetchSchedules()
      } catch (err) {
        // Schedule update failed, but config was already saved successfully
        console.error(
          'Schedule update failed after successful config save:',
          err,
        )
        // Show a warning toast to inform the user
        toast.warning('Schedule Update Failed', {
          description:
            'Configuration saved successfully, but the schedule update failed. Please try updating the schedule separately.',
        })
      }
    }
  }

  return {
    // Schedule management (operational controls)
    quotaMaintenanceJob: scheduleHook.quotaMaintenanceJob,
    isLoading: scheduleHook.isLoading,
    schedulerError: scheduleHook.schedulerError,
    toggleQuotaSchedule: scheduleHook.toggleQuotaSchedule,
    runQuotaNow: scheduleHook.runQuotaNow,
    isTogglingQuota: scheduleHook.isTogglingQuota,
    isRunningQuota: scheduleHook.isRunningQuota,
    formatLastRun: scheduleHook.formatLastRun,
    formatNextRun: scheduleHook.formatNextRun,

    // Schedule configuration
    quotaScheduleTime: scheduleHook.quotaScheduleTime,
    quotaDayOfWeek: scheduleHook.quotaDayOfWeek,
    handleQuotaTimeChange: scheduleHook.handleQuotaTimeChange,
    saveQuotaSchedule: scheduleHook.saveQuotaSchedule,

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
