import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { z } from 'zod'
import { useConfigStore } from '@/stores/configStore'
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

export type { ApprovalConfigurationFormData }

/**
 * Hook for managing approval and quota configuration
 */
// Define save status type matching delete sync
type FormSaveStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Provides a React hook for managing approval and quota configuration forms with validation, state synchronization, and persistence.
 *
 * Handles form state using `react-hook-form` and Zod schema validation, synchronizes with the global configuration store, manages save and error states, and provides submit and cancel handlers. Excludes schedule-related fields from configuration updates and provides user feedback via toast notifications.
 *
 * @returns An object containing the form instance, current config, error state, saving status, save status, submitted values, submit and cancel handlers, and a flag indicating if the form has unsaved changes.
 */
export function useApprovalConfiguration() {
  const { config, updateConfig } = useConfigStore()
  const [error] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<FormSaveStatus>('idle')
  const [submittedValues, setSubmittedValues] =
    useState<ApprovalConfigurationFormData | null>(null)
  const { toast } = useToast()

  // Computed state matching delete sync pattern
  const isSaving = saveStatus === 'loading'

  const form = useForm<ApprovalConfigurationFormData>({
    resolver: zodResolver(approvalConfigurationSchema),
    defaultValues: {
      approvalExpiration: {
        enabled: false,
        defaultExpirationHours: 72,
        expirationAction: 'expire',
        cleanupExpiredDays: 30,
      },
      quotaSettings: {
        cleanup: {
          enabled: true,
          retentionDays: 90,
        },
        weeklyRolling: {
          resetDays: 7,
        },
        monthly: {
          resetDay: 1,
          handleMonthEnd: 'last-day',
        },
      },
      approvalNotify: 'none',
      scheduleInterval: undefined,
      scheduleTime: undefined,
      dayOfWeek: '*',
    },
    mode: 'onChange',
  })

  const createFormResetData = useCallback(
    (
      config: z.infer<typeof ConfigSchema>,
      currentScheduleInterval?: number,
      currentScheduleTime?: Date,
      currentDayOfWeek?: string,
    ): ApprovalConfigurationFormData => {
      const notifyValue = config.approvalNotify || 'none'

      // Parse and validate the data through the form schema to ensure correct types
      const formData = {
        approvalExpiration: config.approvalExpiration
          ? {
              enabled: config.approvalExpiration.enabled ?? false,
              defaultExpirationHours:
                config.approvalExpiration.defaultExpirationHours ?? 72,
              expirationAction:
                config.approvalExpiration.expirationAction ?? 'expire',
              quotaExceededExpirationHours:
                config.approvalExpiration.quotaExceededExpirationHours,
              routerRuleExpirationHours:
                config.approvalExpiration.routerRuleExpirationHours,
              manualFlagExpirationHours:
                config.approvalExpiration.manualFlagExpirationHours,
              contentCriteriaExpirationHours:
                config.approvalExpiration.contentCriteriaExpirationHours,
              cleanupExpiredDays:
                config.approvalExpiration.cleanupExpiredDays ?? 30,
            }
          : {
              enabled: false,
              defaultExpirationHours: 72,
              expirationAction: 'expire',
              cleanupExpiredDays: 30,
            },
        quotaSettings: config.quotaSettings
          ? {
              cleanup: {
                enabled: config.quotaSettings.cleanup?.enabled ?? true,
                retentionDays:
                  config.quotaSettings.cleanup?.retentionDays ?? 90,
              },
              weeklyRolling: {
                resetDays: config.quotaSettings.weeklyRolling?.resetDays ?? 7,
              },
              monthly: {
                resetDay: config.quotaSettings.monthly?.resetDay ?? 1,
                handleMonthEnd:
                  config.quotaSettings.monthly?.handleMonthEnd ?? 'last-day',
              },
            }
          : {
              cleanup: { enabled: true, retentionDays: 90 },
              weeklyRolling: { resetDays: 7 },
              monthly: { resetDay: 1, handleMonthEnd: 'last-day' },
            },
        approvalNotify: notifyValue,
        scheduleInterval: currentScheduleInterval,
        scheduleTime: currentScheduleTime,
        dayOfWeek: currentDayOfWeek ?? '*',
      }

      // Validate and parse through the form schema to ensure correct types
      return approvalConfigurationSchema.parse(formData)
    },
    [],
  )

  // Load configuration when config changes
  useEffect(() => {
    if (config) {
      const currentScheduleInterval = form.getValues('scheduleInterval')
      const currentScheduleTime = form.getValues('scheduleTime')
      const currentDayOfWeek = form.getValues('dayOfWeek')

      const resetData = createFormResetData(
        config,
        currentScheduleInterval,
        currentScheduleTime,
        currentDayOfWeek,
      )
      form.reset(resetData, { keepDirty: false })

      // Add the timeout fallback like delete sync form
      setTimeout(() => {
        const notifyValue = config.approvalNotify || 'none'
        if (form.getValues('approvalNotify') !== notifyValue) {
          form.setValue('approvalNotify', notifyValue, { shouldDirty: false })
        }
        form.reset(form.getValues(), { keepDirty: false })
      }, 0)
    }
  }, [config, form, createFormResetData])

  const onSubmit = async (data: ApprovalConfigurationFormData) => {
    // Set loading state and store submitted values - matching delete sync pattern
    setSaveStatus('loading')
    setSubmittedValues(data)

    try {
      // Minimum loading duration matching delete sync (500ms)
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Prepare the update payload - send objects directly (no JSON.stringify)
      const updatePayload: Partial<ApprovalConfigurationFormData> = {}

      // Add approval expiration settings if present
      if (data.approvalExpiration) {
        updatePayload.approvalExpiration = data.approvalExpiration
      }

      // Add quota settings if present
      if (data.quotaSettings) {
        updatePayload.quotaSettings = data.quotaSettings
      }

      // Add approval notification settings (always include with default)
      updatePayload.approvalNotify = data.approvalNotify || 'none'

      // Schedule fields should NOT be sent to config - they need to be handled by scheduler
      // Remove schedule fields from config update payload

      // Run config update and minimum loading time in parallel
      // Additional operations can be passed in via context if needed
      await Promise.all([updateConfig(updatePayload), minimumLoadingTime])

      // Success state matching delete sync pattern
      setSaveStatus('success')

      // Reset form with saved values to clear dirty state
      form.reset(data)

      toast({
        description:
          'Approval and quota settings have been updated successfully.',
        variant: 'default',
      })

      // Show success state for 1 second (matching delete sync)
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Clear submitted values and reset to idle
      setSubmittedValues(null)
      setSaveStatus('idle')
    } catch (err) {
      console.error('Error saving configuration:', err)

      // Set error state
      setSaveStatus('error')

      toast({
        title: 'Save Failed',
        description:
          err instanceof Error ? err.message : 'Failed to save configuration',
        variant: 'destructive',
      })

      // Error cleanup after 1 second (matching delete sync)
      setTimeout(() => {
        setSubmittedValues(null)
        setSaveStatus('idle')
      }, 1000)
    }
  }

  const handleCancel = () => {
    // Reset form to last saved values using the same pattern as the useEffect
    if (config) {
      const currentScheduleInterval = form.getValues('scheduleInterval')
      const currentScheduleTime = form.getValues('scheduleTime')
      const currentDayOfWeek = form.getValues('dayOfWeek')

      const resetData = createFormResetData(
        config,
        currentScheduleInterval,
        currentScheduleTime,
        currentDayOfWeek,
      )
      form.reset(resetData, { keepDirty: false })
    }
  }

  return {
    form,
    config,
    error,
    isSaving,
    saveStatus,
    submittedValues,
    onSubmit,
    handleCancel,
    hasChanges: form.formState.isDirty,
  }
}
