import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import * as z from 'zod'
import type { Config } from '@root/types/config.types'

// Schema definition
export const deleteSyncSchema = z.object({
  deletionMode: z.enum(['watchlist', 'tag-based']).default('watchlist'),
  deleteMovie: z.boolean(),
  deleteEndedShow: z.boolean(),
  deleteContinuingShow: z.boolean(),
  deleteFiles: z.boolean(),
  respectUserSyncSetting: z.boolean(),
  enablePlexPlaylistProtection: z.boolean(),
  plexProtectionPlaylistName: z.string().min(1),
  deleteSyncNotify: z.enum([
    'none',
    'message',
    'webhook',
    'both',
    'all',
    'discord-only',
    'apprise-only',
    'webhook-only',
    'dm-only',
    'discord-webhook',
    'discord-message',
    'discord-both',
  ]),
  maxDeletionPrevention: z.coerce.number().int().min(1).max(100).optional(),
  scheduleTime: z.date().optional(),
  dayOfWeek: z.string().default('*'),
  // removedTagPrefix should be configured in the User Tags section when using the 'special-tag' removal mode
  // This value is read-only in this form but is still needed for the tag-based deletion logic
  removedTagPrefix: z.string().default('pulsarr:removed'),
})

export type DeleteSyncFormValues = z.infer<typeof deleteSyncSchema>
export type FormSaveStatus = 'idle' | 'loading' | 'success' | 'error'

const validateDayOfWeek = (value: string | undefined): string => {
  // Valid patterns: '*' (every day) or a single digit from 0-6
  const validPattern = /^\*$|^[0-6]$/

  // If the value is undefined, empty, or doesn't match the pattern, return '*'
  if (!value || !validPattern.test(value)) {
    console.warn(
      `Invalid dayOfWeek value "${value}" detected, falling back to "*"`,
    )
    return '*'
  }

  return value
}

/**
 * Manages the deletion synchronization form state and submission logic.
 *
 * This custom React hook initializes a form with validation based on a Zod schema for deletion
 * synchronization settings. It extracts schedule information from existing cron jobs, synchronizes the
 * form state with global configuration, and provides handlers for submitting, canceling, and updating
 * scheduled deletion times.
 *
 * On submission, the hook updates configuration settings, optionally updates the deletion schedule by
 * constructing a corresponding cron expression, and triggers a refresh of the schedules. It also manages
 * the form submission status and displays toast notifications for success or error outcomes.
 *
 * @returns An object containing:
 * - form: The React Hook Form instance managing the deletion sync form.
 * - saveStatus: The current status of the form submission.
 * - isSaving: A boolean indicating if the form is currently being submitted.
 * - submittedValues: The most recently submitted form values or null.
 * - onSubmit: Function to handle form submission.
 * - handleCancel: Function to reset the form to the current configuration values.
 * - handleTimeChange: Function to update the form's schedule time and day of the week.
 */
export function useDeleteSyncForm() {
  const { toast } = useToast()
  const { config, updateConfig } = useConfigStore()
  const { schedules, fetchSchedules, setLoadingWithMinDuration } =
    useUtilitiesStore()
  const [saveStatus, setSaveStatus] = useState<FormSaveStatus>('idle')
  const [submittedValues, setSubmittedValues] =
    useState<DeleteSyncFormValues | null>(null)

  const [scheduleTime, dayOfWeek] = useMemo(() => {
    // Default values
    let time: Date | undefined = undefined
    let day = '*'

    const deleteSyncJob = schedules?.find((job) => job.name === 'delete-sync')

    if (
      deleteSyncJob &&
      deleteSyncJob.type === 'cron' &&
      deleteSyncJob.config?.expression
    ) {
      try {
        const cronParts = deleteSyncJob.config.expression.split(' ')
        if (cronParts.length >= 6) {
          const hour = Number.parseInt(cronParts[2])
          const minute = Number.parseInt(cronParts[1])

          if (Number.isFinite(hour) && Number.isFinite(minute)) {
            const date = new Date()
            date.setHours(hour)
            date.setMinutes(minute)
            date.setSeconds(0)
            date.setMilliseconds(0)
            time = date
            day = cronParts[5]
          }
        }
      } catch (e) {
        console.error('Failed to parse cron expression', e)
      }
    }

    return [time, day]
  }, [schedules])

  const form = useForm<DeleteSyncFormValues>({
    resolver: zodResolver(deleteSyncSchema),
    defaultValues: {
      deletionMode: 'watchlist',
      deleteMovie: false,
      deleteEndedShow: false,
      deleteContinuingShow: false,
      deleteFiles: false,
      respectUserSyncSetting: true,
      enablePlexPlaylistProtection: false,
      plexProtectionPlaylistName: 'Do Not Delete',
      deleteSyncNotify: 'none',
      maxDeletionPrevention: undefined,
      scheduleTime: undefined,
      dayOfWeek: '*',
      removedTagPrefix: 'pulsarr:removed',
    },
  })

  const formInitializedRef = useRef(false)

  useEffect(() => {
    if (
      config &&
      (!formInitializedRef.current || scheduleTime) &&
      saveStatus === 'idle'
    ) {
      formInitializedRef.current = true

      // Ensure notification value is one of the valid enum values
      const notifyValue = config.deleteSyncNotify || 'none'

      form.reset(
        {
          deletionMode: config.deletionMode || 'watchlist',
          deleteMovie: config.deleteMovie || false,
          deleteEndedShow: config.deleteEndedShow || false,
          deleteContinuingShow: config.deleteContinuingShow || false,
          deleteFiles: config.deleteFiles || false,
          respectUserSyncSetting: config.respectUserSyncSetting ?? true,
          enablePlexPlaylistProtection:
            config.enablePlexPlaylistProtection || false,
          plexProtectionPlaylistName:
            config.plexProtectionPlaylistName || 'Do Not Delete',
          deleteSyncNotify: notifyValue,
          maxDeletionPrevention: config.maxDeletionPrevention,
          scheduleTime: scheduleTime || form.getValues('scheduleTime'),
          dayOfWeek: dayOfWeek,
          removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
        },
        { keepDirty: false },
      )

      setTimeout(() => {
        if (form.getValues('deleteSyncNotify') !== notifyValue) {
          form.setValue('deleteSyncNotify', notifyValue, { shouldDirty: false })
        }

        form.reset(form.getValues(), { keepDirty: false })
      }, 0)
    }
  }, [config, scheduleTime, dayOfWeek, form, saveStatus])

  const onSubmit = async (data: DeleteSyncFormValues) => {
    setSubmittedValues(data)
    setSaveStatus('loading')
    setLoadingWithMinDuration(true)

    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      const updateConfigPromise = updateConfig({
        deletionMode: data.deletionMode,
        deleteMovie: data.deleteMovie,
        deleteEndedShow: data.deleteEndedShow,
        deleteContinuingShow: data.deleteContinuingShow,
        deleteFiles: data.deleteFiles,
        respectUserSyncSetting: data.respectUserSyncSetting,
        enablePlexPlaylistProtection: data.enablePlexPlaylistProtection,
        plexProtectionPlaylistName: data.plexProtectionPlaylistName,
        deleteSyncNotify: data.deleteSyncNotify,
        maxDeletionPrevention: data.maxDeletionPrevention,
        // We still send the removedTagPrefix value from the form
        // This value is now read-only in Delete Sync but needed for the tag-based deletion logic
        removedTagPrefix: data.removedTagPrefix,
      })

      let scheduleUpdate = Promise.resolve()

      if (data.scheduleTime) {
        const hours = data.scheduleTime.getHours()
        const minutes = data.scheduleTime.getMinutes()
        const dayOfWeek = validateDayOfWeek(data.dayOfWeek)

        // Create cron expression (seconds minutes hours day month weekday)
        const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`

        scheduleUpdate = fetch('/v1/scheduler/schedules/delete-sync', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'cron',
            config: {
              expression: cronExpression,
            },
          }),
        }).then((response) => {
          if (!response.ok) {
            throw new Error('Failed to update schedule')
          }
          return
        })
      }

      // Run all operations in parallel
      await Promise.all([
        updateConfigPromise,
        scheduleUpdate,
        minimumLoadingTime,
      ])

      // Refresh schedules
      await fetchSchedules()

      // Set success state
      setSaveStatus('success')

      toast({
        description: 'Settings saved successfully',
        variant: 'default',
      })

      // Reset form with updated configuration
      const updatedConfig =
        useConfigStore.getState().config || config || ({} as Config)

      // Apply the form reset
      form.reset(
        {
          deletionMode: updatedConfig.deletionMode || 'watchlist',
          deleteMovie: updatedConfig.deleteMovie || false,
          deleteEndedShow: updatedConfig.deleteEndedShow || false,
          deleteContinuingShow: updatedConfig.deleteContinuingShow || false,
          deleteFiles: updatedConfig.deleteFiles || false,
          respectUserSyncSetting: updatedConfig.respectUserSyncSetting ?? true,
          enablePlexPlaylistProtection:
            updatedConfig.enablePlexPlaylistProtection || false,
          plexProtectionPlaylistName:
            updatedConfig.plexProtectionPlaylistName || 'Do Not Delete',
          deleteSyncNotify: updatedConfig.deleteSyncNotify || 'none',
          maxDeletionPrevention: updatedConfig.maxDeletionPrevention,
          scheduleTime: data.scheduleTime,
          dayOfWeek: data.dayOfWeek,
          removedTagPrefix: updatedConfig.removedTagPrefix || 'pulsarr:removed',
        },
        { keepDirty: false },
      )

      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Only now reset the status to idle and clear submitted values
      setSubmittedValues(null)
      setSaveStatus('idle')
    } catch (error) {
      console.error('Failed to save configuration:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save settings'

      setSaveStatus('error')
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })

      setTimeout(() => {
        setSubmittedValues(null)
        setSaveStatus('idle')
      }, 1000)
    } finally {
      setLoadingWithMinDuration(false)
    }
  }

  const handleCancel = useCallback(() => {
    if (config) {
      form.reset({
        deletionMode: config.deletionMode || 'watchlist',
        deleteMovie: config.deleteMovie || false,
        deleteEndedShow: config.deleteEndedShow || false,
        deleteContinuingShow: config.deleteContinuingShow || false,
        deleteFiles: config.deleteFiles || false,
        respectUserSyncSetting: config.respectUserSyncSetting ?? true,
        enablePlexPlaylistProtection:
          config.enablePlexPlaylistProtection || false,
        plexProtectionPlaylistName:
          config.plexProtectionPlaylistName || 'Do Not Delete',
        deleteSyncNotify: config.deleteSyncNotify || 'none',
        maxDeletionPrevention: config.maxDeletionPrevention,
        scheduleTime: scheduleTime,
        dayOfWeek: dayOfWeek,
        removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
      })
    }
  }, [config, form, scheduleTime, dayOfWeek])

  const handleTimeChange = useCallback(
    (newTime: Date, newDay?: string) => {
      form.setValue('scheduleTime', newTime, { shouldDirty: true })
      if (newDay !== undefined) {
        form.setValue('dayOfWeek', newDay, { shouldDirty: true })
      }
    },
    [form],
  )

  return {
    form,
    saveStatus,
    isSaving: saveStatus === 'loading',
    submittedValues,
    onSubmit,
    handleCancel,
    handleTimeChange,
  }
}
