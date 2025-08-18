import { zodResolver } from '@hookform/resolvers/zod'
import { ConfigSchema } from '@root/schemas/config/config.schema'
import type { Config } from '@root/types/config.types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'

// Extract delete sync fields from backend API schema
const ApiDeleteSyncSchema = ConfigSchema.pick({
  deletionMode: true,
  deleteMovie: true,
  deleteEndedShow: true,
  deleteContinuingShow: true,
  deleteFiles: true,
  respectUserSyncSetting: true,
  enablePlexPlaylistProtection: true,
  plexProtectionPlaylistName: true,
  deleteSyncNotify: true,
  deleteSyncNotifyOnlyOnDeletion: true,
  maxDeletionPrevention: true,
  removedTagPrefix: true,
  removedTagMode: true,
})

// Extend with client-specific fields for scheduling
export const deleteSyncSchema = ApiDeleteSyncSchema.extend({
  scheduleTime: z.date().optional(),
  dayOfWeek: z.string().default('*'),
}).refine(
  (data) => {
    // If deletion mode is tag-based, removedTagMode must be 'special-tag'
    if (
      data.deletionMode === 'tag-based' &&
      data.removedTagMode !== 'special-tag'
    ) {
      return false
    }
    return true
  },
  {
    message:
      'Tag-based deletion requires "Tag Behavior on Removal" to be set to "Special Tag"',
    path: ['deletionMode'],
  },
)

export type DeleteSyncFormValues = z.input<typeof deleteSyncSchema>
export type FormSaveStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Manages the Delete Sync form state, validation, initialization from global config/schedules, and submission.
 *
 * Provides a React Hook Form instance for delete-sync settings (including scheduling fields), synchronizes initial values from the global configuration and the 'delete-sync' cron schedule, enforces schema validation, and exposes handlers to submit changes (which persist configuration and schedule updates), cancel edits, and update the scheduled time.
 *
 * @returns An object containing:
 *  - form: the React Hook Form instance for delete-sync values
 *  - saveStatus: current save status ('idle' | 'loading' | 'success' | 'error')
 *  - isSaving: boolean indicating an in-progress save
 *  - submittedValues: the last-submitted form values or null
 *  - onSubmit: handler to submit form values (persists config and schedule)
 *  - handleCancel: resets the form to current configuration/schedule values
 *  - handleTimeChange: updates the form's scheduleTime and optional dayOfWeek
 */
export function useDeleteSyncForm() {
  const { config, updateConfig } = useConfigStore()
  const { schedules, setLoadingWithMinDuration, updateSchedule } =
    useUtilitiesStore()
  const [saveStatus, setSaveStatus] = useState<FormSaveStatus>('idle')
  const [submittedValues, setSubmittedValues] =
    useState<DeleteSyncFormValues | null>(null)

  // Watch for removedTagMode updates from config

  const [scheduleTime, dayOfWeek] = useMemo(() => {
    // Default values
    let time: Date | undefined
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
          const hour = Number.parseInt(cronParts[2], 10)
          const minute = Number.parseInt(cronParts[1], 10)

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
      deleteSyncNotifyOnlyOnDeletion: false,
      maxDeletionPrevention: undefined,
      scheduleTime: undefined,
      dayOfWeek: '*',
      removedTagPrefix: 'pulsarr:removed',
      removedTagMode: 'remove',
    },
  })

  const formInitializedRef = useRef(false)

  useEffect(() => {
    if (
      config &&
      config.deletionMode !== undefined &&
      (!formInitializedRef.current || scheduleTime) &&
      saveStatus === 'idle'
    ) {
      formInitializedRef.current = true

      // Ensure notification value is one of the valid enum values
      const notifyValue = config.deleteSyncNotify || 'none'

      form.reset(
        {
          deletionMode: config.deletionMode ?? 'watchlist',
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
          deleteSyncNotifyOnlyOnDeletion:
            config.deleteSyncNotifyOnlyOnDeletion || false,
          maxDeletionPrevention: config.maxDeletionPrevention,
          scheduleTime: scheduleTime || form.getValues('scheduleTime'),
          dayOfWeek: dayOfWeek,
          removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
          removedTagMode: config.removedTagMode || 'remove',
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

  // Update removedTagMode whenever config changes
  useEffect(() => {
    if (
      config?.removedTagMode &&
      form.getValues('removedTagMode') !== config.removedTagMode
    ) {
      form.setValue('removedTagMode', config.removedTagMode, {
        shouldDirty: false,
      })
      // Force re-validation of the form
      form.trigger('deletionMode')
    }
  }, [config?.removedTagMode, form])

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
        deleteSyncNotifyOnlyOnDeletion: data.deleteSyncNotifyOnlyOnDeletion,
        maxDeletionPrevention: data.maxDeletionPrevention,
        // We still send the removedTagPrefix value from the form
        // This value is now read-only in Delete Sync but needed for the tag-based deletion logic
        // Always persist the prefix so it is not lost when toggling modes
        removedTagPrefix: data.removedTagPrefix,
        // CRITICAL: Include removedTagMode to prevent it from being reset
        removedTagMode: data.removedTagMode,
      })

      let scheduleUpdate = Promise.resolve()

      if (data.scheduleTime) {
        const hours = data.scheduleTime.getHours()
        const minutes = data.scheduleTime.getMinutes()
        const dayOfWeek = data.dayOfWeek || '*'

        // Create cron expression (seconds minutes hours day month weekday)
        const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`

        scheduleUpdate = updateSchedule('delete-sync', {
          type: 'cron',
          config: {
            expression: cronExpression,
          },
        }).then((success) => {
          if (!success) {
            throw new Error('Failed to update schedule')
          }
        })
      }

      // Run all operations in parallel
      await Promise.all([
        updateConfigPromise,
        scheduleUpdate,
        minimumLoadingTime,
      ])

      // Set success state
      setSaveStatus('success')

      toast.success('Settings saved successfully')

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
          deleteSyncNotifyOnlyOnDeletion:
            updatedConfig.deleteSyncNotifyOnlyOnDeletion || false,
          maxDeletionPrevention: updatedConfig.maxDeletionPrevention,
          scheduleTime: data.scheduleTime,
          dayOfWeek: data.dayOfWeek,
          removedTagPrefix: updatedConfig.removedTagPrefix || 'pulsarr:removed',
          removedTagMode: updatedConfig.removedTagMode || 'remove',
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
      toast.error(errorMessage)

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
        deleteSyncNotifyOnlyOnDeletion:
          config.deleteSyncNotifyOnlyOnDeletion || false,
        maxDeletionPrevention: config.maxDeletionPrevention,
        scheduleTime: scheduleTime,
        dayOfWeek: dayOfWeek,
        removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
        removedTagMode: config.removedTagMode || 'remove',
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
