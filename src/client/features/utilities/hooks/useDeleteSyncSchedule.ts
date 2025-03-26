import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

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
      try {
        // Parse time from cron expression (assuming format like "0 0 3 * * 1" for 3 AM on Monday)
        const cronParts = deleteSyncJob.config.expression.split(' ')
        if (cronParts.length >= 6) {
          const hour = Number.parseInt(cronParts[2])
          const minute = Number.parseInt(cronParts[1])
          const day = cronParts[5]

          if (!isNaN(hour) && !isNaN(minute)) {
            const date = new Date()
            date.setHours(hour)
            date.setMinutes(minute)
            date.setSeconds(0)
            date.setMilliseconds(0)
            setScheduleTime(date)
            setDayOfWeek(day)
          }
        }
      } catch (e) {
        console.error('Failed to parse cron expression', e)
      }
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
