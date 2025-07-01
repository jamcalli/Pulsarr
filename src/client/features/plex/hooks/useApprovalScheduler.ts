import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { toast } from 'sonner'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

/**
 * React hook for managing the scheduling, configuration, and execution of approval and quota maintenance jobs.
 *
 * Provides state, formatting utilities, and action handlers for configuring interval-based (approval) and time-based (quota) jobs. Supports cron expression parsing and generation, schedule updates, status toggling, immediate execution, and run time formatting. Integrates with a backend scheduler and exposes job data, configuration states, loading and error indicators, and UI interaction handlers.
 *
 * @returns An object containing job data, schedule configuration states, loading and error indicators, formatting utilities, and action handlers for approval and quota maintenance schedules.
 */
export function useApprovalScheduler() {
  const {
    schedules,
    loading,
    error,
    fetchSchedules,
    runScheduleNow,
    toggleScheduleStatus,
  } = useUtilitiesStore()

  // Schedule time states for quota (daily scheduling)
  const [quotaScheduleTime, setQuotaScheduleTime] = useState<Date | undefined>(
    undefined,
  )
  const [quotaDayOfWeek, setQuotaDayOfWeek] = useState<string>('*')

  // Schedule interval state for approval (hourly intervals)
  const [approvalInterval, setApprovalInterval] = useState<number | null>(null)

  // Loading states for individual actions
  const [isTogglingApproval, setIsTogglingApproval] = useState(false)
  const [isTogglingQuota, setIsTogglingQuota] = useState(false)
  const [isRunningApproval, setIsRunningApproval] = useState(false)
  const [isRunningQuota, setIsRunningQuota] = useState(false)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)

  // Get individual jobs from schedules
  const getApprovalMaintenanceJob = useCallback(() => {
    if (!schedules) return null
    return schedules.find((job) => job.name === 'approval-maintenance')
  }, [schedules])

  const getQuotaMaintenanceJob = useCallback(() => {
    if (!schedules) return null
    return schedules.find((job) => job.name === 'quota-maintenance')
  }, [schedules])

  const approvalMaintenanceJob = getApprovalMaintenanceJob()
  const quotaMaintenanceJob = getQuotaMaintenanceJob()

  // Parse cron expressions for quota schedules (time-based)
  const parseQuotaCronExpression = useCallback((cronExpression: string) => {
    try {
      const cronParts = cronExpression.split(' ')

      if (cronParts.length >= 5) {
        // Handle both 5-part (minute hour dom month dow) and 6-part (second minute hour dom month dow) formats
        const hourIndex = cronParts.length === 5 ? 1 : 2
        const minuteIndex = cronParts.length === 5 ? 0 : 1
        const dayIndex = cronParts.length === 5 ? 4 : 5

        const hour = Number.parseInt(cronParts[hourIndex], 10)
        const minute = Number.parseInt(cronParts[minuteIndex], 10)
        const day = cronParts[dayIndex]

        if (
          Number.isFinite(hour) &&
          Number.isFinite(minute) &&
          hour >= 0 &&
          hour <= 23 &&
          minute >= 0 &&
          minute <= 59
        ) {
          const date = new Date()
          date.setHours(hour, minute, 0, 0)

          // Validate the created date
          if (!Number.isNaN(date.getTime())) {
            return { time: date, dayOfWeek: day }
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse quota cron expression:', e)
    }
    return null
  }, [])

  // Parse cron expressions for approval schedules (interval-based)
  const parseApprovalCronExpression = useCallback((cronExpression: string) => {
    try {
      const cronParts = cronExpression.split(' ')

      if (cronParts.length >= 5) {
        // Handle both 5-part (minute hour dom month dow) and 6-part (second minute hour dom month dow) formats
        const hourIndex = cronParts.length === 5 ? 1 : 2
        const hourPart = cronParts[hourIndex]

        // Look for interval patterns like */4, */2, etc.
        const intervalMatch = hourPart.match(/^\*\/(\d+)$/)
        if (intervalMatch) {
          const interval = Number.parseInt(intervalMatch[1], 10)
          if (Number.isFinite(interval) && interval > 0 && interval <= 24) {
            return interval
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse approval cron expression:', e)
    }
    return null
  }, [])

  // Extract schedule intervals from approval jobs when they update
  useEffect(() => {
    if (
      approvalMaintenanceJob?.type === 'cron' &&
      approvalMaintenanceJob.config?.expression
    ) {
      const interval = parseApprovalCronExpression(
        approvalMaintenanceJob.config.expression,
      )
      if (interval) {
        setApprovalInterval(interval)
      } else {
        // If no valid interval is found in cron expression, set to default 4
        setApprovalInterval(4)
      }
    } else if (approvalMaintenanceJob && approvalInterval === null) {
      // If job exists but has no valid cron expression, set to default 4
      setApprovalInterval(4)
    }
  }, [approvalMaintenanceJob, parseApprovalCronExpression, approvalInterval])

  // Extract schedule times from quota jobs when they update
  useEffect(() => {
    if (
      quotaMaintenanceJob?.type === 'cron' &&
      quotaMaintenanceJob.config?.expression
    ) {
      const parsed = parseQuotaCronExpression(
        quotaMaintenanceJob.config.expression,
      )
      if (parsed) {
        setQuotaScheduleTime(parsed.time)
        setQuotaDayOfWeek(parsed.dayOfWeek)
      }
    }
  }, [quotaMaintenanceJob, parseQuotaCronExpression])

  // Load schedules on first mount if not already loaded
  useEffect(() => {
    if (!schedules && !loading.schedules) {
      fetchSchedules().catch((err) => {
        console.error('Failed to fetch schedules:', err)
      })
    }
  }, [schedules, loading.schedules, fetchSchedules])

  // Generate cron expression for approval maintenance (interval-based)
  const generateApprovalCronExpression = useCallback((interval: number) => {
    return `0 */${interval} * * *`
  }, [])

  // Generate cron expression for quota maintenance (time-based)
  const generateQuotaCronExpression = useCallback(
    (time: Date, dayOfWeek: string) => {
      const hour = time.getHours()
      const minute = time.getMinutes()
      return `${minute} ${hour} * * ${dayOfWeek}`
    },
    [],
  )

  // Generic schedule update function
  const updateSchedule = useCallback(
    async (
      scheduleName: 'approval-maintenance' | 'quota-maintenance',
      cronExpression: string,
      successMessage: string,
    ) => {
      setIsSavingSchedule(true)
      try {
        const response = await fetch(
          `/v1/scheduler/schedules/${scheduleName}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'cron',
              config: { expression: cronExpression },
              enabled: true,
            }),
          },
        )

        if (!response.ok) {
          throw new Error(`Failed to update ${scheduleName} schedule`)
        }

        // Refresh schedules
        await fetchSchedules()

        toast.success(successMessage)

        return true
      } catch (err) {
        console.error(`Error updating ${scheduleName} schedule:`, err)
        toast.error(
          err instanceof Error
            ? err.message
            : `Failed to update ${scheduleName} schedule`,
        )
        return false
      } finally {
        setIsSavingSchedule(false)
      }
    },
    [fetchSchedules],
  )

  // Schedule update function for approval maintenance (interval-based)
  const updateApprovalSchedule = useCallback(
    async (interval: number) => {
      const cronExpression = generateApprovalCronExpression(interval)
      const successMessage = `Approval maintenance will now run every ${interval} hour${interval !== 1 ? 's' : ''}.`
      return updateSchedule(
        'approval-maintenance',
        cronExpression,
        successMessage,
      )
    },
    [generateApprovalCronExpression, updateSchedule],
  )

  // Schedule update function for quota maintenance (time-based)
  const updateQuotaSchedule = useCallback(
    async (time: Date, dayOfWeek: string) => {
      const cronExpression = generateQuotaCronExpression(time, dayOfWeek)
      const successMessage =
        'Quota maintenance schedule has been updated successfully.'
      return updateSchedule('quota-maintenance', cronExpression, successMessage)
    },
    [generateQuotaCronExpression, updateSchedule],
  )

  // Format last run time
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

  // Format next run time
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

  // Handle changes
  const handleApprovalIntervalChange = useCallback((interval: number) => {
    setApprovalInterval(interval)
  }, [])

  const handleQuotaTimeChange = useCallback(
    (date: Date, dayOfWeek?: string) => {
      setQuotaScheduleTime(date)
      if (dayOfWeek) {
        setQuotaDayOfWeek(dayOfWeek)
      }
    },
    [],
  )

  // Toggle schedule status
  const toggleApprovalSchedule = useCallback(
    async (enabled: boolean) => {
      setIsTogglingApproval(true)
      try {
        const success = await toggleScheduleStatus(
          'approval-maintenance',
          enabled,
        )
        if (success) {
          toast.success(
            `Approval maintenance schedule has been ${enabled ? 'enabled' : 'disabled'}.`,
          )
        }
      } catch (err) {
        toast.error('Failed to toggle approval schedule status')
      } finally {
        setIsTogglingApproval(false)
      }
    },
    [toggleScheduleStatus],
  )

  const toggleQuotaSchedule = useCallback(
    async (enabled: boolean) => {
      setIsTogglingQuota(true)
      try {
        const success = await toggleScheduleStatus('quota-maintenance', enabled)
        if (success) {
          toast.success(
            `Quota maintenance schedule has been ${enabled ? 'enabled' : 'disabled'}.`,
          )
        }
      } catch (err) {
        toast.error('Failed to toggle quota schedule status')
      } finally {
        setIsTogglingQuota(false)
      }
    },
    [toggleScheduleStatus],
  )

  // Run schedules now
  const runApprovalNow = useCallback(async () => {
    setIsRunningApproval(true)
    try {
      const success = await runScheduleNow('approval-maintenance')
      if (success) {
        toast.success('Approval maintenance job has been started.')
      }
    } catch (err) {
      toast.error('Failed to run approval maintenance job')
    } finally {
      setIsRunningApproval(false)
    }
  }, [runScheduleNow])

  const runQuotaNow = useCallback(async () => {
    setIsRunningQuota(true)
    try {
      const success = await runScheduleNow('quota-maintenance')
      if (success) {
        toast.success('Quota maintenance job has been started.')
      }
    } catch (err) {
      toast.error('Failed to run quota maintenance job')
    } finally {
      setIsRunningQuota(false)
    }
  }, [runScheduleNow])

  // Save schedule functions
  const saveApprovalSchedule = useCallback(async () => {
    if (approvalInterval === null) return false
    return updateApprovalSchedule(approvalInterval)
  }, [updateApprovalSchedule, approvalInterval])

  const saveQuotaSchedule = useCallback(async () => {
    if (!quotaScheduleTime) return false
    return updateQuotaSchedule(quotaScheduleTime, quotaDayOfWeek)
  }, [updateQuotaSchedule, quotaScheduleTime, quotaDayOfWeek])

  return {
    // Job data
    approvalMaintenanceJob,
    quotaMaintenanceJob,

    // Schedule configuration
    approvalInterval,
    quotaScheduleTime,
    quotaDayOfWeek,

    // Loading states
    isLoading: loading.schedules || isSavingSchedule,
    schedulerError: error.schedules,
    isTogglingApproval,
    isTogglingQuota,
    isRunningApproval,
    isRunningQuota,

    // Utility functions
    formatLastRun,
    formatNextRun,

    // Action handlers
    handleApprovalIntervalChange,
    handleQuotaTimeChange,
    toggleApprovalSchedule,
    toggleQuotaSchedule,
    runApprovalNow,
    runQuotaNow,
    saveApprovalSchedule,
    saveQuotaSchedule,
  }
}
