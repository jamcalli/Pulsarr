import { zodResolver } from '@hookform/resolvers/zod'
import type {
  CleanupPlexLabelsResponse,
  RemovePlexLabelsResponse,
  SyncPlexLabelsResponse,
} from '@root/schemas/labels/plex-labels.schema'
import {
  type PlexLabelSyncConfig,
  PlexLabelSyncConfigSchema,
} from '@root/schemas/plex/label-sync-config.schema'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { useMutation } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  invalidateSchedules,
  useScheduleActions,
  useSchedules,
} from '@/features/utilities/hooks/useSchedules'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import { useMinLoadingMutation, withMinDuration } from '@/lib/useMinLoading'
import { parseCronExpression } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'

export type PlexLabelsFormValues = z.input<typeof PlexLabelSyncConfigSchema>

// Union type for action results
type ActionResult =
  | SyncPlexLabelsResponse
  | CleanupPlexLabelsResponse
  | RemovePlexLabelsResponse

/**
 * Determines if the given action result is a sync labels response.
 *
 * Returns true if the response object contains a `mode` property set to `'sync'`.
 *
 * @returns True if the response is a sync labels response; otherwise, false.
 */
export function isSyncLabelsResponse(
  response: ActionResult,
): response is SyncPlexLabelsResponse {
  return 'mode' in response && response.mode === 'sync'
}

/**
 * Checks if the provided action result matches the structure of a cleanup labels response.
 *
 * Returns true if the response contains both `pending` and `orphaned` properties and does not include a `mode` property.
 *
 * @returns True if the response is a cleanup labels response; otherwise, false.
 */
export function isCleanupLabelsResponse(
  response: ActionResult,
): response is CleanupPlexLabelsResponse {
  // CleanupLabelsResponse doesn't have a mode property, but it has specific structure
  return (
    'pending' in response && 'orphaned' in response && !('mode' in response)
  )
}

/**
 * Checks if the given action result is a remove labels response.
 *
 * Returns true if the response object contains a `mode` property with the value `'remove'`.
 */
export function isRemoveLabelsResponse(
  response: ActionResult,
): response is RemovePlexLabelsResponse {
  return 'mode' in response && response.mode === 'remove'
}

/**
 * Provides state and handlers for managing Plex label synchronization configuration, scheduling, and related actions in a React application.
 *
 * This hook persists Plex label sync settings through the global configuration, manages the full sync schedule, and performs actions such as syncing, cleaning, and removing Plex labels. It exposes a validated form instance, state flags for loading and operation status, last operation results, label deletion status, schedule data, and handler functions for all supported operations. Designed for use in UI components that configure or control Plex label synchronization.
 *
 * @returns An object containing the form instance, state flags, last operation results, label deletion status, schedule information, and handler functions for Plex label configuration and actions.
 */
export function usePlexLabels() {
  const [lastActionResults, setLastActionResults] =
    useState<ActionResult | null>(null)
  const [localRemoveResults, setLocalRemoveResults] =
    useState<RemovePlexLabelsResponse | null>(null)
  const [labelDefinitionsDeleted, setLabelDefinitionsDeleted] = useState(false)
  // Track when label deletion is complete
  const [isLabelDeletionComplete, setIsLabelDeletionComplete] = useState(false)
  // Add save status state to match DeleteSyncForm
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')

  const initialLoadRef = useRef(true)

  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [
    showDeletePlexLabelsConfirmation,
    setShowDeletePlexLabelsConfirmation,
  ] = useState(false)

  const schedules = useSchedules().data
  const { toggleScheduleStatus, updateSchedule } = useScheduleActions()

  const syncLabelsMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/labels/sync'),
        )
        if (error) throw error
        return data
      },
    }),
  )

  const cleanupLabelsMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/labels/cleanup'),
        )
        if (error) throw error
        return data
      },
    }),
  )

  const removeLabelsMutation = useMinLoadingMutation(
    useMutation({
      mutationFn: async () => {
        const { data, error } = await withMinDuration(
          apiFetch.DELETE('/v1/labels/remove'),
        )
        if (error) throw error
        return data
      },
    }),
  )

  const { config, updateConfig } = useConfigStore()

  // Get the plex-label-full-sync job from schedules
  const fullSyncJob = useMemo(() => {
    return schedules?.find((job) => job.name === 'plex-label-full-sync') || null
  }, [schedules])

  // Extract schedule time and day of week from cron expression
  const [scheduleTime, dayOfWeek] = useMemo(() => {
    if (fullSyncJob?.type === 'cron' && fullSyncJob.config?.expression) {
      return parseCronExpression(fullSyncJob.config.expression)
    }
    return [undefined, '*']
  }, [fullSyncJob])

  // Initialize form with default values
  const form = useForm<PlexLabelsFormValues>({
    resolver: zodResolver(PlexLabelSyncConfigSchema),
    mode: 'onChange',
    defaultValues: {
      enabled: false,
      labelPrefix: 'pulsarr',
      labelNamingSource: 'username',
      concurrencyLimit: 5,
      cleanupOrphanedLabels: false,
      removedLabelMode: 'remove',
      removedLabelPrefix: 'pulsarr:removed',
      autoResetOnScheduledSync: false,
      scheduleTime: undefined,
      dayOfWeek: '*',
      tagSync: {
        enabled: false,
        syncRadarrTags: true,
        syncSonarrTags: true,
      },
    },
  })

  // Update form values when config data is available
  const updateFormValues = useCallback(
    (plexLabelSyncConfig: PlexLabelSyncConfig) => {
      form.reset({
        enabled: plexLabelSyncConfig.enabled,
        labelPrefix: plexLabelSyncConfig.labelPrefix,
        labelNamingSource: plexLabelSyncConfig.labelNamingSource || 'username',
        concurrencyLimit: plexLabelSyncConfig.concurrencyLimit || 5,
        cleanupOrphanedLabels:
          plexLabelSyncConfig.cleanupOrphanedLabels || false,
        removedLabelMode: plexLabelSyncConfig.removedLabelMode || 'remove',
        removedLabelPrefix:
          plexLabelSyncConfig.removedLabelPrefix || 'pulsarr:removed',
        autoResetOnScheduledSync:
          plexLabelSyncConfig.autoResetOnScheduledSync || false,
        scheduleTime: scheduleTime,
        dayOfWeek: dayOfWeek,
        tagSync: {
          enabled: plexLabelSyncConfig.tagSync?.enabled || false,
          syncRadarrTags: plexLabelSyncConfig.tagSync?.syncRadarrTags !== false,
          syncSonarrTags: plexLabelSyncConfig.tagSync?.syncSonarrTags !== false,
        },
      })
    },
    [form, scheduleTime, dayOfWeek],
  )

  // Initialize form values from config when available
  useEffect(() => {
    if (
      config?.plexLabelSync &&
      (initialLoadRef.current ||
        scheduleTime !== undefined ||
        dayOfWeek !== '*')
    ) {
      // Add minimum 500ms display time for initial loading
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      Promise.all([
        updateFormValues(config.plexLabelSync), // Existing logic
        minimumLoadingTime, // New timing enforcement
      ]).then(() => {
        initialLoadRef.current = false

        // Reset label definitions deleted state if labeling is enabled
        if (config?.plexLabelSync?.enabled) {
          setLabelDefinitionsDeleted(false)
          setIsLabelDeletionComplete(false)
        }

        setIsInitialLoading(false)

        setTimeout(() => {
          form.reset(form.getValues(), { keepDirty: false })
        }, 0)
      })
    }
  }, [config?.plexLabelSync, scheduleTime, dayOfWeek, updateFormValues, form])

  // Fallback effect to clear loading state if config fails to load
  useEffect(() => {
    if (initialLoadRef.current) {
      const fallbackTimer = setTimeout(() => {
        if (initialLoadRef.current) {
          initialLoadRef.current = false
          setIsInitialLoading(false)
        }
      }, 3000) // 3 second fallback timeout

      return () => clearTimeout(fallbackTimer)
    }
  }, [])

  // Full sync schedule state
  const [isTogglingFullSyncStatus, setIsTogglingFullSyncStatus] =
    useState(false)

  // Format last run time
  const formatLastRun = useCallback(
    (lastRun: JobStatus['last_run'] | null | undefined) => {
      if (!lastRun?.time) return 'Never'
      try {
        return formatDistanceToNow(parseISO(lastRun.time), { addSuffix: true })
      } catch (_e) {
        return lastRun.time
      }
    },
    [],
  )

  // Format next run time
  const formatNextRun = useCallback(
    (nextRun: JobStatus['next_run'] | null | undefined) => {
      if (!nextRun?.time) return 'Not scheduled'
      try {
        return formatDistanceToNow(parseISO(nextRun.time), { addSuffix: true })
      } catch (_e) {
        return nextRun.time
      }
    },
    [],
  )

  // Handle time change for form integration (like Delete Sync)
  const handleTimeChange = useCallback(
    (newTime: Date, newDay?: string) => {
      form.setValue('scheduleTime', newTime, {
        shouldDirty: true,
        shouldValidate: true,
      })
      if (newDay !== undefined) {
        form.setValue('dayOfWeek', newDay, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
    },
    [form],
  )

  // Toggle full sync status directly (no confirmation)
  const handleToggleFullSyncStatus = useCallback(
    async (currentlyEnabled: boolean) => {
      setIsTogglingFullSyncStatus(true)

      try {
        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Run operations in parallel and wait for both
        const [success] = await Promise.all([
          toggleScheduleStatus('plex-label-full-sync', !currentlyEnabled),
          minimumLoadingTime,
        ])

        if (success) {
          toast.success(
            `Plex label full sync ${currentlyEnabled ? 'disabled' : 'enabled'} successfully`,
          )
        } else {
          throw new Error('Failed to toggle full sync status')
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to toggle full sync status'
        toast.error(errorMessage)
      } finally {
        // Refresh schedules to update UI state regardless of success/failure
        await invalidateSchedules().catch((fetchErr) => {
          console.error('Failed to refresh schedules after toggle:', fetchErr)
        })
        setIsTogglingFullSyncStatus(false)
      }
    },
    [toggleScheduleStatus],
  )

  // Handle form submission - using main config system
  const onSubmit = useCallback(
    async (data: PlexLabelsFormValues) => {
      setSaveStatus('loading')

      try {
        // Transform the form data using the schema before using it
        const transformedData = PlexLabelSyncConfigSchema.parse(data)
        const formDataCopy = { ...transformedData }

        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Update config through main config system
        const updateConfigPromise = updateConfig({
          plexLabelSync: formDataCopy,
        })

        // Handle schedule update based on scheduleTime
        let scheduleUpdatePromise = Promise.resolve()
        if (transformedData.scheduleTime) {
          const hours = transformedData.scheduleTime.getHours()
          const minutes = transformedData.scheduleTime.getMinutes()
          const dayOfWeek = transformedData.dayOfWeek || '*'

          // Create cron expression (seconds minutes hours day month weekday)
          const cronExpression = `0 ${minutes} ${hours} * * ${dayOfWeek}`

          scheduleUpdatePromise = updateSchedule('plex-label-full-sync', {
            type: 'cron',
            config: {
              expression: cronExpression,
            },
          }).then((success) => {
            if (!success) {
              throw new Error(
                'Failed to update sync schedule. Configuration was saved but schedule was not updated.',
              )
            }
          })
        } else {
          // Disable the cron job when scheduleTime is cleared
          scheduleUpdatePromise = toggleScheduleStatus(
            'plex-label-full-sync',
            false,
          ).then((success) => {
            if (!success) {
              throw new Error(
                'Failed to disable sync schedule. Configuration was saved but schedule was not disabled.',
              )
            }
          })
        }

        // Wait for all processes to complete (exactly like DeleteSyncForm)
        await Promise.all([
          updateConfigPromise,
          scheduleUpdatePromise,
          minimumLoadingTime,
        ])

        // Refresh schedules to get updated data
        await invalidateSchedules()

        // If we enable labeling, we can no longer edit the label format
        if (transformedData.enabled) {
          setLabelDefinitionsDeleted(false)
          setIsLabelDeletionComplete(false)
        }

        // Set success state
        setSaveStatus('success')

        toast.success('Settings saved successfully')

        // Reset form with updated configuration
        form.reset(formDataCopy, { keepDirty: false })

        // Wait before setting status back to idle (exactly like DeleteSyncForm)
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Only now reset the status to idle
        setSaveStatus('idle')
      } catch (error) {
        console.error('Failed to save configuration:', error)
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to save settings'

        setSaveStatus('error')
        toast.error(errorMessage)

        setTimeout(() => {
          setSaveStatus('idle')
        }, 1000)
      }
    },
    [form, updateConfig, updateSchedule, toggleScheduleStatus],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (config?.plexLabelSync) {
      updateFormValues(config.plexLabelSync)
    }
  }, [config?.plexLabelSync, updateFormValues])

  // Sync labels operation
  const handleSyncLabels = useCallback(async () => {
    try {
      // Reset label definitions deleted state when syncing labels (which may create new ones)
      setLabelDefinitionsDeleted(false)
      setIsLabelDeletionComplete(false)
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await syncLabelsMutation.mutateAsync()
      setLastActionResults(result)

      toast.success(result.message || 'Pulsarr labels synced successfully')
    } catch (err) {
      toast.error(apiErrorMessage(err) ?? 'Failed to sync Pulsarr labels')
    }
  }, [syncLabelsMutation.mutateAsync])

  // Clean up orphaned labels operation
  const handleCleanupLabels = useCallback(async () => {
    try {
      // Clear previous remove results
      setLocalRemoveResults(null)

      const result = await cleanupLabelsMutation.mutateAsync()
      setLastActionResults(result)

      toast.success(
        result.message || 'Orphaned Pulsarr labels cleaned up successfully',
      )
    } catch (err) {
      toast.error(
        apiErrorMessage(err) ?? 'Failed to clean up orphaned Pulsarr labels',
      )
    }
  }, [cleanupLabelsMutation.mutateAsync])

  // Show loading until initial config has loaded, with a 500ms minimum
  const isLoading = isInitialLoading

  const initiateRemoveLabels = useCallback(() => {
    setShowDeletePlexLabelsConfirmation(true)
  }, [])

  const handleRemoveLabels = useCallback(async () => {
    try {
      // Reset completion state at the start of operation
      setIsLabelDeletionComplete(false)

      const result = await removeLabelsMutation.mutateAsync()

      // Set the local remove results
      setLocalRemoveResults(result)

      // Mark operation as complete
      setIsLabelDeletionComplete(true)

      setLabelDefinitionsDeleted(true)

      toast.success(result.message || 'Pulsarr labels removed successfully')
    } catch (err) {
      // Reset states on error
      setIsLabelDeletionComplete(false)
      setLabelDefinitionsDeleted(false)

      toast.error(apiErrorMessage(err) ?? 'Failed to remove Pulsarr labels')
    }
  }, [removeLabelsMutation.mutateAsync])

  // Memoize lastResults to avoid referential churn
  const lastResults = useMemo(
    () =>
      config?.plexLabelSync
        ? {
            success: true,
            message: 'Configuration loaded',
            config: config.plexLabelSync,
          }
        : null,
    [config?.plexLabelSync],
  )

  // Handle toggle enable/disable with consistent loading patterns
  const handleToggle = useCallback(
    async (newEnabledState: boolean) => {
      setSaveStatus('loading')

      try {
        // Apply minimum loading time for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Get current config values and update enabled state
        const currentConfig = config?.plexLabelSync
        if (!currentConfig) throw new Error('Configuration not available')

        const formData = { ...currentConfig, enabled: newEnabledState }

        // Update config through main config system
        await Promise.all([
          updateConfig({ plexLabelSync: formData }),
          minimumLoadingTime,
        ])

        // If we enable labeling, we can no longer edit the label format
        if (newEnabledState) {
          setLabelDefinitionsDeleted(false)
          setIsLabelDeletionComplete(false)
        }

        // Only update form state if the API call succeeds
        form.setValue('enabled', newEnabledState, { shouldDirty: false })

        toast.success(
          `Plex labeling ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
        )

        setSaveStatus('success')

        // Wait before setting status back to idle
        await new Promise((resolve) => setTimeout(resolve, 1000))

        setSaveStatus('idle')
      } catch (error) {
        console.error('Failed to toggle Plex labeling:', error)
        const errorMessage =
          error instanceof Error
            ? error.message
            : `Failed to ${newEnabledState ? 'enable' : 'disable'} Plex labeling`

        setSaveStatus('error')
        toast.error(errorMessage)

        setTimeout(() => {
          setSaveStatus('idle')
        }, 1000)

        // Re-throw the error for the component to handle
        throw error
      }
    },
    [form, updateConfig, config?.plexLabelSync],
  )

  return {
    form,
    // Use saveStatus instead of loading.plexLabels to match the DeleteSyncForm pattern
    isSaving: saveStatus === 'loading',
    isToggling: saveStatus === 'loading' || isTogglingFullSyncStatus,
    isLoading,
    isSyncingLabels: syncLabelsMutation.isPending,
    isCleaningLabels: cleanupLabelsMutation.isPending,
    error:
      apiErrorMessage(syncLabelsMutation.error) ??
      apiErrorMessage(cleanupLabelsMutation.error) ??
      apiErrorMessage(removeLabelsMutation.error),
    lastResults,
    lastActionResults,
    lastRemoveResults: localRemoveResults,
    labelDefinitionsDeleted,
    isLabelDeletionComplete,
    onSubmit,
    handleCancel,
    handleToggle,
    handleSyncLabels,
    handleCleanupLabels,
    isRemovingLabels: removeLabelsMutation.isPending,
    showDeleteConfirmation: showDeletePlexLabelsConfirmation,
    setShowDeleteConfirmation: setShowDeletePlexLabelsConfirmation,
    initiateRemoveLabels,
    handleRemoveLabels,

    // Full sync schedule functionality
    scheduleTime,
    dayOfWeek,
    fullSyncJob,
    formatLastRun,
    formatNextRun,
    isTogglingFullSyncStatus,
    handleToggleFullSyncStatus: () => {
      if (!fullSyncJob) return
      return handleToggleFullSyncStatus(fullSyncJob.enabled)
    },
    handleTimeChange,
  }
}
