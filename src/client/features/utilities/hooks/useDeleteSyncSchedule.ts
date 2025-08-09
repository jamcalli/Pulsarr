import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { parseCronExpression } from '@/lib/utils'

/**
 * React hook that provides scheduling information and formatting helpers for the "delete-sync" job.
 *
 * Retrieves the "delete-sync" job from the utilities store, parses its cron expression to determine the scheduled execution time and day of the week, and exposes functions to format the last and next run times as human-readable strings. Automatically fetches schedules if they are not already loaded.
 *
 * @returns An object containing:
 * - scheduleTime: The scheduled execution time as a Date, or undefined if unavailable.
 * - dayOfWeek: The day of the week from the cron expression, or '*' if not set.
 * - deleteSyncJob: The job data for "delete-sync", or null if not found.
 * - isLoading: Whether schedules are currently being loaded.
 * - error: Any error encountered while fetching schedules.
 * - formatLastRun: Formats the last run time as a relative string.
 * - formatNextRun: Formats the next run time as a relative string.
 */
export function useDeleteSyncSchedule() {
  const { schedules, loading, error, fetchSchedules } = useUtilitiesStore()
  const [scheduleTime, setScheduleTime] = useState<Date | undefined>(undefined)
  const [dayOfWeek, setDayOfWeek] = useState<string>('*')

  // Get the delete-sync job from schedules
  const getDeleteSyncJob = useCallback(() => {
    if (!schedules) return null
    return schedules.find((job) => job.name === 'delete-sync')
  }, [schedules])

  const deleteSyncJob = getDeleteSyncJob()

  // Extract schedule time from cron if available
  useEffect(() => {
    if (
      deleteSyncJob &&
      deleteSyncJob.type === 'cron' &&
      deleteSyncJob.config?.expression
    ) {
      const [parsedTime, parsedDay] = parseCronExpression(
        deleteSyncJob.config.expression,
      )
      setScheduleTime(parsedTime)
      setDayOfWeek(parsedDay)
    } else {
      // Reset to defaults when not a cron job or no expression is present
      setScheduleTime(undefined)
      setDayOfWeek('*')
    }
  }, [deleteSyncJob])

  // Load schedules on first mount if not already loaded
  useEffect(() => {
    if (!schedules && !loading.schedules) {
      fetchSchedules().catch((err) => {
        console.error('Failed to fetch schedules:', err)
      })
    }
  }, [schedules, loading.schedules, fetchSchedules])

  // Format last run time with proper handling
  const formatLastRun = useCallback(
    (lastRun: JobStatus['last_run'] | null | undefined) => {
      if (!lastRun?.time) return 'Never'

      try {
        return formatDistanceToNow(parseISO(lastRun.time), { addSuffix: true })
      } catch (e) {
        return lastRun.time
      }
    },
    [],
  )

  // Format next run time with proper handling
  const formatNextRun = useCallback(
    (nextRun: JobStatus['next_run'] | null | undefined) => {
      if (!nextRun?.time) return 'Not scheduled'

      try {
        return formatDistanceToNow(parseISO(nextRun.time), { addSuffix: true })
      } catch (e) {
        return nextRun.time
      }
    },
    [],
  )

  return {
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,
    isLoading: loading.schedules,
    error: error.schedules,
    formatLastRun,
    formatNextRun,
  }
}
