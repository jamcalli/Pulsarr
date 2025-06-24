import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useToast } from '@/hooks/use-toast'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

/**
 * Hook for managing approval and quota maintenance schedules
 *
 * Provides comprehensive scheduler integration for both approval-maintenance and quota-maintenance jobs,
 * including schedule status display, time configuration, enable/disable functionality, and run now capabilities.
 * Follows the same patterns as the delete sync scheduler UI for consistency.
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
  const { toast } = useToast()

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
          if (Number.isFinite(interval) && interval > 0 && interval <= 23) {
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

  // Schedule update function for approval maintenance (interval-based)
  const updateApprovalSchedule = useCallback(
    async (interval: number) => {
      setIsSavingSchedule(true)
      try {
        const cronExpression = generateApprovalCronExpression(interval)

        const response = await fetch(
          '/v1/scheduler/schedules/approval-maintenance',
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
          throw new Error('Failed to update approval maintenance schedule')
        }

        // Refresh schedules
        await fetchSchedules()

        toast({
          title: 'Schedule Updated',
          description: `Approval maintenance will now run every ${interval} hour${interval !== 1 ? 's' : ''}.`,
          variant: 'default',
        })

        return true
      } catch (err) {
        console.error('Error updating approval schedule:', err)
        toast({
          title: 'Update Failed',
          description:
            err instanceof Error
              ? err.message
              : 'Failed to update approval schedule',
          variant: 'destructive',
        })
        return false
      } finally {
        setIsSavingSchedule(false)
      }
    },
    [generateApprovalCronExpression, fetchSchedules, toast],
  )

  // Schedule update function for quota maintenance (time-based)
  const updateQuotaSchedule = useCallback(
    async (time: Date, dayOfWeek: string) => {
      setIsSavingSchedule(true)
      try {
        const cronExpression = generateQuotaCronExpression(time, dayOfWeek)

        const response = await fetch(
          '/v1/scheduler/schedules/quota-maintenance',
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
          throw new Error('Failed to update quota maintenance schedule')
        }

        // Refresh schedules
        await fetchSchedules()

        toast({
          title: 'Schedule Updated',
          description:
            'Quota maintenance schedule has been updated successfully.',
          variant: 'default',
        })

        return true
      } catch (err) {
        console.error('Error updating quota schedule:', err)
        toast({
          title: 'Update Failed',
          description:
            err instanceof Error
              ? err.message
              : 'Failed to update quota schedule',
          variant: 'destructive',
        })
        return false
      } finally {
        setIsSavingSchedule(false)
      }
    },
    [generateQuotaCronExpression, fetchSchedules, toast],
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
          toast({
            title: `Approval Schedule ${enabled ? 'Enabled' : 'Disabled'}`,
            description: `Approval maintenance schedule has been ${enabled ? 'enabled' : 'disabled'}.`,
            variant: 'default',
          })
        }
      } catch (err) {
        toast({
          title: 'Toggle Failed',
          description: 'Failed to toggle approval schedule status',
          variant: 'destructive',
        })
      } finally {
        setIsTogglingApproval(false)
      }
    },
    [toggleScheduleStatus, toast],
  )

  const toggleQuotaSchedule = useCallback(
    async (enabled: boolean) => {
      setIsTogglingQuota(true)
      try {
        const success = await toggleScheduleStatus('quota-maintenance', enabled)
        if (success) {
          toast({
            title: `Quota Schedule ${enabled ? 'Enabled' : 'Disabled'}`,
            description: `Quota maintenance schedule has been ${enabled ? 'enabled' : 'disabled'}.`,
            variant: 'default',
          })
        }
      } catch (err) {
        toast({
          title: 'Toggle Failed',
          description: 'Failed to toggle quota schedule status',
          variant: 'destructive',
        })
      } finally {
        setIsTogglingQuota(false)
      }
    },
    [toggleScheduleStatus, toast],
  )

  // Run schedules now
  const runApprovalNow = useCallback(async () => {
    setIsRunningApproval(true)
    try {
      const success = await runScheduleNow('approval-maintenance')
      if (success) {
        toast({
          title: 'Approval Maintenance Started',
          description: 'Approval maintenance job has been started.',
          variant: 'default',
        })
      }
    } catch (err) {
      toast({
        title: 'Run Failed',
        description: 'Failed to run approval maintenance job',
        variant: 'destructive',
      })
    } finally {
      setIsRunningApproval(false)
    }
  }, [runScheduleNow, toast])

  const runQuotaNow = useCallback(async () => {
    setIsRunningQuota(true)
    try {
      const success = await runScheduleNow('quota-maintenance')
      if (success) {
        toast({
          title: 'Quota Maintenance Started',
          description: 'Quota maintenance job has been started.',
          variant: 'default',
        })
      }
    } catch (err) {
      toast({
        title: 'Run Failed',
        description: 'Failed to run quota maintenance job',
        variant: 'destructive',
      })
    } finally {
      setIsRunningQuota(false)
    }
  }, [runScheduleNow, toast])

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
