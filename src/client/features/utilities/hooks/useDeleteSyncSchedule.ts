import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { parseCronExpression } from '@/lib/utils'

/**
 * Custom React hook to manage schedule details for the "delete-sync" job.
 *
 * This hook retrieves scheduled jobs from the utilities store and extracts the schedule time and day of the week
 * by parsing the cron expression of the "delete-sync" job. It also provides helper functions to convert the last and next
 * run times into human-readable relative time strings. Additionally, it initiates the fetching of schedules if they are not
 * already loaded.
 *
 * @returns An object containing:
 * - scheduleTime: The Date object representing the scheduled execution time, or undefined if not available.
 * - dayOfWeek: The day of the week extracted from the cron expression, or '*' by default.
 * - deleteSyncJob: The job data for "delete-sync", or null if not found.
 * - isLoading: Boolean indicating whether schedules are currently being loaded.
 * - error: Any error encountered while fetching the schedules.
 * - formatLastRun: A function that formats the last run time into a human-readable relative time string.
 * - formatNextRun: A function that formats the next run time into a human-readable relative time string.
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
