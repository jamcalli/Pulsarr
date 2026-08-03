import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'
import { useSchedules } from '@/features/utilities/hooks/useSchedules'
import { apiErrorMessage } from '@/lib/tanstackApi'
import { parseCronExpression } from '@/lib/utils'

/**
 * React hook that provides scheduling information and formatting helpers for the "delete-sync" job.
 *
 * Finds the "delete-sync" job in the shared schedules query, parses its cron expression to determine the scheduled execution time and day of the week, and exposes functions to format the last and next run times as human-readable strings.
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
  const schedulesQuery = useSchedules()
  const schedules = schedulesQuery.data
  const [scheduleTime, setScheduleTime] = useState<Date | undefined>(undefined)
  const [dayOfWeek, setDayOfWeek] = useState<string>('*')

  const deleteSyncJob =
    schedules?.find((job) => job.name === 'delete-sync') ?? null

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

  // Format last run time with proper handling
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

  // Format next run time with proper handling
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

  return {
    scheduleTime,
    dayOfWeek,
    deleteSyncJob,
    isLoading: schedulesQuery.isLoading,
    error: apiErrorMessage(schedulesQuery.error),
    formatLastRun,
    formatNextRun,
  }
}
