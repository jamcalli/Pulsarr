import { zodResolver } from '@hookform/resolvers/zod'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  SessionMonitoringConfigSchema,
  type SessionMonitoringFormData,
} from '@/features/utilities/constants/session-monitoring'
import { useUtilitiesStore } from '@/features/utilities/store/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'

export type FormSaveStatus = 'idle' | 'loading' | 'success' | 'error'

export function useSessionMonitoringForm() {
  const { config, updateConfig } = useConfigStore()
  const {
    schedules,
    fetchSchedules,
    toggleScheduleStatus,
    updateSessionMonitorSchedule,
    updateAutoResetSchedule,
    setLoadingWithMinDuration,
  } = useUtilitiesStore()

  const [saveStatus, setSaveStatus] = useState<FormSaveStatus>('idle')
  const [submittedValues, setSubmittedValues] =
    useState<SessionMonitoringFormData | null>(null)
  const [inactivityDays, setInactivityDays] = useState(
    config?.plexSessionMonitoring?.inactivityResetDays || 7,
  )
  const [isToggling, setIsToggling] = useState(false)
  const formInitializedRef = useRef(false)

  const form = useForm<SessionMonitoringFormData>({
    resolver: zodResolver(SessionMonitoringConfigSchema),
    mode: 'onChange',
    defaultValues: {
      enabled: false,
      pollingIntervalMinutes: 15,
      remainingEpisodes: 2,
      filterUsers: [],
      enableAutoReset: true,
      inactivityResetDays: 7,
      autoResetIntervalHours: 24,
      enableProgressiveCleanup: false,
    },
  })

  // Find the session monitoring schedules
  const sessionMonitorSchedule = schedules?.find(
    (s) => s.name === 'plex-session-monitor',
  )
  const autoResetSchedule = schedules?.find(
    (s) => s.name === 'plex-rolling-auto-reset',
  )

  const isEnabled = form.watch('enabled')

  // Update form values when config data is available
  useEffect(() => {
    if (
      config?.plexSessionMonitoring &&
      !formInitializedRef.current &&
      saveStatus === 'idle'
    ) {
      formInitializedRef.current = true

      const formValues = {
        enabled: config.plexSessionMonitoring.enabled ?? false,
        pollingIntervalMinutes:
          config.plexSessionMonitoring.pollingIntervalMinutes ?? 15,
        remainingEpisodes: config.plexSessionMonitoring.remainingEpisodes ?? 2,
        filterUsers: config.plexSessionMonitoring.filterUsers ?? [],
        enableAutoReset: config.plexSessionMonitoring.enableAutoReset ?? true,
        inactivityResetDays:
          config.plexSessionMonitoring.inactivityResetDays ?? 7,
        autoResetIntervalHours:
          config.plexSessionMonitoring.autoResetIntervalHours ?? 24,
        enableProgressiveCleanup:
          config.plexSessionMonitoring.enableProgressiveCleanup ?? false,
      }

      form.reset(formValues, { keepDirty: false })
      setInactivityDays(config.plexSessionMonitoring.inactivityResetDays || 7)

      setTimeout(() => {
        form.reset(form.getValues(), { keepDirty: false })
      }, 0)
    }
  }, [config?.plexSessionMonitoring, form, saveStatus])

  const handleUpdateSessionMonitorSchedule = useCallback(
    async (schedule: JobStatus, data: SessionMonitoringFormData) => {
      if (schedule.enabled !== data.enabled) {
        await toggleScheduleStatus(schedule.name, data.enabled)
      }

      const currentInterval =
        schedule.type === 'interval' ? schedule.config?.minutes || 15 : 15
      if (data.enabled && currentInterval !== data.pollingIntervalMinutes) {
        const success = await updateSessionMonitorSchedule(
          schedule.name,
          data.pollingIntervalMinutes,
        )
        if (!success) {
          throw new Error('Failed to update polling interval')
        }
      }
    },
    [toggleScheduleStatus, updateSessionMonitorSchedule],
  )

  const handleUpdateAutoResetSchedule = useCallback(
    async (schedule: JobStatus, data: SessionMonitoringFormData) => {
      const shouldEnableAutoReset =
        data.enabled && (data.enableAutoReset ?? true)

      if (schedule.enabled !== shouldEnableAutoReset) {
        await toggleScheduleStatus(schedule.name, shouldEnableAutoReset)
      }

      const currentAutoResetInterval =
        schedule.type === 'interval' ? schedule.config?.hours || 24 : 24
      const newAutoResetInterval = data.autoResetIntervalHours ?? 24
      if (
        shouldEnableAutoReset &&
        currentAutoResetInterval !== newAutoResetInterval
      ) {
        const success = await updateAutoResetSchedule(
          schedule.name,
          newAutoResetInterval,
        )
        if (!success) {
          throw new Error('Failed to update auto-reset interval')
        }
      }
    },
    [toggleScheduleStatus, updateAutoResetSchedule],
  )

  const handleToggle = useCallback(
    async (newEnabledState: boolean) => {
      setIsToggling(true)
      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        const currentValues = form.getValues()
        const formData = { ...currentValues, enabled: newEnabledState }

        const transformedData = SessionMonitoringConfigSchema.parse(formData)

        const updateConfigPromise = updateConfig({
          plexSessionMonitoring: transformedData,
        })

        const schedulePromises: Promise<void>[] = []
        if (sessionMonitorSchedule) {
          schedulePromises.push(
            handleUpdateSessionMonitorSchedule(
              sessionMonitorSchedule,
              formData,
            ),
          )
        }
        if (autoResetSchedule) {
          schedulePromises.push(
            handleUpdateAutoResetSchedule(autoResetSchedule, formData),
          )
        }

        await Promise.all([
          updateConfigPromise,
          ...schedulePromises,
          minimumLoadingTime,
        ])

        form.setValue('enabled', newEnabledState, { shouldDirty: false })
        toast.success(
          `Session monitoring ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
        )
      } catch (error) {
        console.error('Failed to toggle session monitoring:', error)
        toast.error(
          `Failed to ${newEnabledState ? 'enable' : 'disable'} session monitoring`,
        )
        throw error
      } finally {
        setIsToggling(false)
      }
    },
    [
      updateConfig,
      form,
      sessionMonitorSchedule,
      autoResetSchedule,
      handleUpdateSessionMonitorSchedule,
      handleUpdateAutoResetSchedule,
    ],
  )

  const onSubmit = useCallback(
    async (data: SessionMonitoringFormData) => {
      setSubmittedValues(data)
      setSaveStatus('loading')
      setLoadingWithMinDuration(true)

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        const transformedData = SessionMonitoringConfigSchema.parse(data)
        const updateConfigPromise = updateConfig({
          plexSessionMonitoring: transformedData,
        })

        const schedulePromises: Promise<void>[] = []

        if (sessionMonitorSchedule) {
          schedulePromises.push(
            handleUpdateSessionMonitorSchedule(sessionMonitorSchedule, data),
          )
        }

        if (autoResetSchedule) {
          schedulePromises.push(
            handleUpdateAutoResetSchedule(autoResetSchedule, data),
          )
        }

        await Promise.all([
          updateConfigPromise,
          ...schedulePromises,
          minimumLoadingTime,
        ])

        await fetchSchedules()

        setSaveStatus('success')
        toast.success('Session monitoring settings updated successfully')

        form.reset(data, { keepDirty: false })

        await new Promise((resolve) => setTimeout(resolve, 1000))

        setSubmittedValues(null)
        setSaveStatus('idle')
      } catch (error) {
        console.error('Failed to update session monitoring settings:', error)
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update session monitoring settings'

        setSaveStatus('error')
        toast.error(errorMessage)

        setTimeout(() => {
          setSubmittedValues(null)
          setSaveStatus('idle')
        }, 1000)
      } finally {
        setLoadingWithMinDuration(false)
      }
    },
    [
      setLoadingWithMinDuration,
      updateConfig,
      sessionMonitorSchedule,
      autoResetSchedule,
      handleUpdateSessionMonitorSchedule,
      handleUpdateAutoResetSchedule,
      fetchSchedules,
      form,
    ],
  )

  const handleCancel = useCallback(() => {
    if (config?.plexSessionMonitoring) {
      const formValues = {
        enabled: config.plexSessionMonitoring.enabled ?? false,
        pollingIntervalMinutes:
          config.plexSessionMonitoring.pollingIntervalMinutes ?? 15,
        remainingEpisodes: config.plexSessionMonitoring.remainingEpisodes ?? 2,
        filterUsers: config.plexSessionMonitoring.filterUsers ?? [],
        enableAutoReset: config.plexSessionMonitoring.enableAutoReset ?? true,
        inactivityResetDays:
          config.plexSessionMonitoring.inactivityResetDays ?? 7,
        autoResetIntervalHours:
          config.plexSessionMonitoring.autoResetIntervalHours ?? 24,
        enableProgressiveCleanup:
          config.plexSessionMonitoring.enableProgressiveCleanup ?? false,
      }
      form.reset(formValues)
      setInactivityDays(config.plexSessionMonitoring.inactivityResetDays || 7)
    }
  }, [config?.plexSessionMonitoring, form])

  return {
    form,
    saveStatus,
    isSaving: saveStatus === 'loading',
    submittedValues,
    sessionMonitorSchedule,
    autoResetSchedule,
    inactivityDays,
    setInactivityDays,
    isToggling,
    isEnabled,
    onSubmit,
    handleCancel,
    handleToggle,
  }
}
