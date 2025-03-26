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
  deleteMovie: z.boolean(),
  deleteEndedShow: z.boolean(),
  deleteContinuingShow: z.boolean(),
  deleteFiles: z.boolean(),
  respectUserSyncSetting: z.boolean(),
  deleteSyncNotify: z.enum(['none', 'message', 'webhook', 'both']),
  maxDeletionPrevention: z.coerce.number().int().min(1).max(100).optional(),
  scheduleTime: z.date().optional(),
  dayOfWeek: z.string().default('*'),
})

export type DeleteSyncFormValues = z.infer<typeof deleteSyncSchema>
export type FormSaveStatus = 'idle' | 'loading' | 'success' | 'error'

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
      deleteMovie: false,
      deleteEndedShow: false,
      deleteContinuingShow: false,
      deleteFiles: false,
      respectUserSyncSetting: true,
      deleteSyncNotify: 'none',
      maxDeletionPrevention: undefined,
      scheduleTime: undefined,
      dayOfWeek: '*',
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
      const notifyValue =
        config.deleteSyncNotify &&
        ['none', 'message', 'webhook', 'both'].includes(config.deleteSyncNotify)
          ? config.deleteSyncNotify
          : 'none'

      form.reset(
        {
          deleteMovie: config.deleteMovie || false,
          deleteEndedShow: config.deleteEndedShow || false,
          deleteContinuingShow: config.deleteContinuingShow || false,
          deleteFiles: config.deleteFiles || false,
          respectUserSyncSetting: config.respectUserSyncSetting ?? true,
          deleteSyncNotify: notifyValue,
          maxDeletionPrevention: config.maxDeletionPrevention,
          scheduleTime: scheduleTime || form.getValues('scheduleTime'),
          dayOfWeek: dayOfWeek,
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
        deleteMovie: data.deleteMovie,
        deleteEndedShow: data.deleteEndedShow,
        deleteContinuingShow: data.deleteContinuingShow,
        deleteFiles: data.deleteFiles,
        respectUserSyncSetting: data.respectUserSyncSetting,
        deleteSyncNotify: data.deleteSyncNotify,
        maxDeletionPrevention: data.maxDeletionPrevention,
      })

      let scheduleUpdate = Promise.resolve()

      if (data.scheduleTime) {
        const hours = data.scheduleTime.getHours()
        const minutes = data.scheduleTime.getMinutes()
        const dayOfWeek = data.dayOfWeek || '*'

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

      setTimeout(() => {
        const updatedConfig =
          useConfigStore.getState().config || config || ({} as Config)

        form.reset(
          {
            deleteMovie: updatedConfig.deleteMovie || false,
            deleteEndedShow: updatedConfig.deleteEndedShow || false,
            deleteContinuingShow: updatedConfig.deleteContinuingShow || false,
            deleteFiles: updatedConfig.deleteFiles || false,
            respectUserSyncSetting:
              updatedConfig.respectUserSyncSetting ?? true,
            deleteSyncNotify: updatedConfig.deleteSyncNotify || 'none',
            maxDeletionPrevention: updatedConfig.maxDeletionPrevention,
            scheduleTime: data.scheduleTime,
            dayOfWeek: data.dayOfWeek,
          },
          { keepDirty: false },
        )

        setSubmittedValues(null)
        setSaveStatus('idle')
      }, 500)
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
        deleteMovie: config.deleteMovie || false,
        deleteEndedShow: config.deleteEndedShow || false,
        deleteContinuingShow: config.deleteContinuingShow || false,
        deleteFiles: config.deleteFiles || false,
        respectUserSyncSetting: config.respectUserSyncSetting ?? true,
        deleteSyncNotify: config.deleteSyncNotify || 'none',
        maxDeletionPrevention: config.maxDeletionPrevention,
        scheduleTime: scheduleTime,
        dayOfWeek: dayOfWeek,
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
