import { useState, useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import {
  SessionMonitoringConfigSchema,
  type SessionMonitoringFormData,
} from '@/features/utilities/constants/session-monitoring'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

export type FormSaveStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * React hook that manages Plex session monitoring configuration, schedules, and related operations.
 *
 * Provides form state and validation for session monitoring settings, synchronizes with global configuration, manages schedule enablement and intervals, and exposes handlers for running the session monitor, resetting or deleting shows, and resetting inactive shows. Integrates with external stores for state management and displays toast notifications for user feedback.
 *
 * @returns An object containing the form instance, save status, schedule data, rolling and inactive shows, loading and error states, active action ID, computed enabled state, and handler functions for all session monitoring operations.
 */
export function useSessionMonitoring() {
  const { config, updateConfig } = useConfigStore()
  const {
    schedules,
    fetchSchedules,
    toggleScheduleStatus,
    updateSessionMonitorSchedule,
    updateAutoResetSchedule,
    setLoadingWithMinDuration,
    rollingShows,
    inactiveShows,
    sessionMonitoringResults,
    fetchRollingShows,
    fetchInactiveShows,
    runSessionMonitor,
    resetShow,
    deleteShow,
    resetInactiveShows,
    loading,
    error,
  } = useUtilitiesStore()

  const [saveStatus, setSaveStatus] = useState<FormSaveStatus>('idle')
  const [submittedValues, setSubmittedValues] =
    useState<SessionMonitoringFormData | null>(null)
  const [inactivityDays, setInactivityDays] = useState(
    config?.plexSessionMonitoring?.inactivityResetDays || 7,
  )
  const [activeActionId, setActiveActionId] = useState<number | null>(null)
  const formInitializedRef = useRef(false)

  // Initialize form with default values following established patterns
  const form = useForm<SessionMonitoringFormData>({
    resolver: zodResolver(SessionMonitoringConfigSchema),
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

  // Watch enabled state
  const isEnabled = form.watch('enabled')

  // Update form values when config data is available (following usePlexLabels pattern)
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

      // WORKAROUND: Reset form to clear dirty state (matching established pattern)
      setTimeout(() => {
        form.reset(form.getValues(), { keepDirty: false })
      }, 0)
    }
  }, [config?.plexSessionMonitoring, form, saveStatus])

  // Fetch data when enabled
  useEffect(() => {
    if (isEnabled) {
      fetchRollingShows()
      fetchInactiveShows(inactivityDays)
    }
  }, [isEnabled, fetchRollingShows, fetchInactiveShows, inactivityDays])

  // Helper function to update session monitor schedule
  const handleUpdateSessionMonitorSchedule = useCallback(
    async (schedule: JobStatus, data: SessionMonitoringFormData) => {
      // Check if enabled state changed
      if (schedule.enabled !== data.enabled) {
        await toggleScheduleStatus(schedule.name, data.enabled)
      }

      // Check if polling interval changed and schedule is enabled
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

  // Helper function to update auto-reset schedule
  const handleUpdateAutoResetSchedule = useCallback(
    async (schedule: JobStatus, data: SessionMonitoringFormData) => {
      // Auto-reset should be enabled when session monitoring is enabled AND enableAutoReset is true
      const shouldEnableAutoReset =
        data.enabled && (data.enableAutoReset ?? true)

      // Check if enabled state changed
      if (schedule.enabled !== shouldEnableAutoReset) {
        await toggleScheduleStatus(schedule.name, shouldEnableAutoReset)
      }

      // Check if auto-reset interval changed and schedule should be enabled
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

  // Form submission handler following established patterns
  const onSubmit = useCallback(
    async (data: SessionMonitoringFormData) => {
      setSubmittedValues(data)
      setSaveStatus('loading')
      setLoadingWithMinDuration(true)

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        const updateConfigPromise = updateConfig({
          plexSessionMonitoring: data,
        })

        // Handle schedule updates in parallel
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

        // Run all operations in parallel
        await Promise.all([
          updateConfigPromise,
          ...schedulePromises,
          minimumLoadingTime,
        ])

        // Refresh schedules
        await fetchSchedules()

        setSaveStatus('success')
        toast.success('Session monitoring settings updated successfully')

        // Reset form with updated values
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

  // Cancel handler following established patterns
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

  // Action handlers with consistent loading patterns
  const handleRunSessionMonitor = useCallback(async () => {
    try {
      const result = await runSessionMonitor()
      toast.success(
        `Session monitor completed. Processed ${result.processedSessions} sessions, triggered ${result.triggeredSearches} searches.`,
      )

      // Refresh rolling shows after running session monitor
      await fetchRollingShows()
    } catch (_err) {
      // Error handling is done in the store
    }
  }, [runSessionMonitor, fetchRollingShows])

  const handleResetShow = useCallback(
    async (id: number) => {
      setActiveActionId(id)
      try {
        const result = await resetShow(id)
        toast.success(result.message || 'Show reset successfully')
      } catch (_err) {
        // Error handling is done in the store
      } finally {
        setActiveActionId(null)
      }
    },
    [resetShow],
  )

  const handleDeleteShow = useCallback(
    async (id: number) => {
      setActiveActionId(id)
      try {
        const result = await deleteShow(id)
        toast.success(result.message || 'Show removed successfully')
      } catch (_err) {
        // Error handling is done in the store
      } finally {
        setActiveActionId(null)
      }
    },
    [deleteShow],
  )

  const handleResetInactiveShows = useCallback(async () => {
    try {
      // Use current form value to stay in sync with UI, fallback to default if undefined
      const currentInactivityDays = form.getValues('inactivityResetDays') ?? 7
      const result = await resetInactiveShows(currentInactivityDays)
      toast.success(`${result.message} (${result.resetCount} shows reset)`)

      // Refresh both rolling and inactive shows using current form value
      await fetchRollingShows()
      await fetchInactiveShows(currentInactivityDays)
    } catch (_err) {
      // Error handling is done in the store
    }
  }, [resetInactiveShows, fetchRollingShows, fetchInactiveShows, form])

  return {
    // Form state
    form,
    saveStatus,
    isSaving: saveStatus === 'loading',
    submittedValues,

    // Schedule data
    sessionMonitorSchedule,
    autoResetSchedule,

    // Rolling shows data
    rollingShows,
    inactiveShows,
    sessionMonitoringResults,
    inactivityDays,
    setInactivityDays,

    // Loading states
    loading: {
      rollingShows: loading.rollingShows,
      inactiveShows: loading.inactiveShows,
      sessionMonitor: loading.sessionMonitor,
      resetShow: loading.resetShow,
      deleteShow: loading.deleteShow,
      resetInactiveShows: loading.resetInactiveShows,
    },

    // Error states
    error: {
      rollingShows: error.rollingShows,
      inactiveShows: error.inactiveShows,
      sessionMonitor: error.sessionMonitor,
      resetShow: error.resetShow,
      deleteShow: error.deleteShow,
      resetInactiveShows: error.resetInactiveShows,
    },

    // Action states
    activeActionId,

    // Computed values
    isEnabled,

    // Handlers
    onSubmit,
    handleCancel,
    handleRunSessionMonitor,
    handleResetShow,
    handleDeleteShow,
    handleResetInactiveShows,
    fetchRollingShows,
    fetchInactiveShows,
  }
}
