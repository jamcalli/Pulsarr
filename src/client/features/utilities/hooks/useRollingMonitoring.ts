import { useState, useCallback, useRef } from 'react'
import { toast } from '@/hooks/use-toast'

// Minimum loading time for better UX across all actions
const MIN_LOADING_TIME = 500

export interface RollingMonitoredShow {
  id: number
  sonarr_series_id: number
  tvdb_id: string | null
  imdb_id: string | null
  show_title: string
  monitoring_type: 'pilot_rolling' | 'first_season_rolling'
  current_monitored_season: number
  last_watched_season: number
  last_watched_episode: number
  last_session_date: string | null
  sonarr_instance_id: number
  plex_user_id: string | null
  plex_username: string | null
  created_at: string
  updated_at: string
  last_updated_at: string
}

export interface SessionMonitoringResult {
  processedSessions: number
  triggeredSearches: number
  errors: string[]
  rollingUpdates: Array<{
    showTitle: string
    action: 'expanded_to_season' | 'expanded_to_next_season' | 'switched_to_all'
    details: string
  }>
}

export interface UseRollingMonitoringReturn {
  // Data
  rollingShows: RollingMonitoredShow[]
  inactiveShows: RollingMonitoredShow[]

  // Loading states
  loading: {
    fetchingShows: boolean
    fetchingInactive: boolean
    resetting: boolean
    deleting: boolean
    runningMonitor: boolean
  }

  // Active action tracking
  activeActionId: number | null

  // Actions
  fetchRollingShows: () => Promise<void>
  fetchInactiveShows: (inactivityDays?: number) => Promise<void>
  resetShow: (id: number) => Promise<void>
  deleteShow: (id: number) => Promise<void>
  resetInactiveShows: (inactivityDays?: number) => Promise<void>
  runSessionMonitor: () => Promise<SessionMonitoringResult | null>
}

export function useRollingMonitoring(): UseRollingMonitoringReturn {
  const [rollingShows, setRollingShows] = useState<RollingMonitoredShow[]>([])
  const [inactiveShows, setInactiveShows] = useState<RollingMonitoredShow[]>([])
  const [loading, setLoading] = useState({
    fetchingShows: false,
    fetchingInactive: false,
    resetting: false,
    deleting: false,
    runningMonitor: false,
  })
  const [activeActionId, setActiveActionId] = useState<number | null>(null)
  const actionStartTime = useRef<number | null>(null)

  const fetchRollingShows = useCallback(async () => {
    const startTime = Date.now()
    setLoading((prev) => ({ ...prev, fetchingShows: true }))
    try {
      const response = await fetch('/v1/session-monitoring/rolling-monitored')
      if (!response.ok) {
        throw new Error('Failed to fetch rolling monitored shows')
      }
      const data = await response.json()

      // Ensure minimum loading time for better UX
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, MIN_LOADING_TIME - elapsed)
      await new Promise((resolve) => setTimeout(resolve, remaining))

      setRollingShows(data.shows || [])
    } catch (error) {
      console.error('Error fetching rolling monitored shows:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch rolling monitored shows',
        variant: 'destructive',
      })
    } finally {
      setLoading((prev) => ({ ...prev, fetchingShows: false }))
    }
  }, [])

  const fetchInactiveShows = useCallback(async (inactivityDays = 7) => {
    const startTime = Date.now()
    setLoading((prev) => ({ ...prev, fetchingInactive: true }))
    try {
      const response = await fetch(
        `/v1/session-monitoring/rolling-monitored/inactive?inactivityDays=${inactivityDays}`,
      )
      if (!response.ok) {
        throw new Error('Failed to fetch inactive shows')
      }
      const data = await response.json()

      // Ensure minimum loading time for better UX
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, MIN_LOADING_TIME - elapsed)
      await new Promise((resolve) => setTimeout(resolve, remaining))

      setInactiveShows(data.shows || [])
    } catch (error) {
      console.error('Error fetching inactive shows:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch inactive shows',
        variant: 'destructive',
      })
    } finally {
      setLoading((prev) => ({ ...prev, fetchingInactive: false }))
    }
  }, [])

  const resetShow = useCallback(
    async (id: number) => {
      actionStartTime.current = Date.now()
      setActiveActionId(id)
      setLoading((prev) => ({ ...prev, resetting: true }))

      try {
        const response = await fetch(
          `/v1/session-monitoring/rolling-monitored/${id}/reset`,
          { method: 'POST' },
        )
        if (!response.ok) {
          throw new Error('Failed to reset show')
        }
        const data = await response.json()

        // Ensure minimum loading time for better UX
        const elapsed = Date.now() - (actionStartTime.current || 0)
        const remaining = Math.max(0, MIN_LOADING_TIME - elapsed)
        await new Promise((resolve) => setTimeout(resolve, remaining))

        toast({
          title: 'Success',
          description: data.message,
        })

        // Refresh the shows list
        await fetchRollingShows()
      } catch (error) {
        console.error('Error resetting show:', error)
        toast({
          title: 'Error',
          description: 'Failed to reset show to original monitoring state',
          variant: 'destructive',
        })
      } finally {
        setLoading((prev) => ({ ...prev, resetting: false }))
        setActiveActionId(null)
        actionStartTime.current = null
      }
    },
    [fetchRollingShows],
  )

  const deleteShow = useCallback(
    async (id: number) => {
      actionStartTime.current = Date.now()
      setActiveActionId(id)
      setLoading((prev) => ({ ...prev, deleting: true }))

      try {
        const response = await fetch(
          `/v1/session-monitoring/rolling-monitored/${id}`,
          { method: 'DELETE' },
        )
        if (!response.ok) {
          throw new Error('Failed to delete show')
        }
        const data = await response.json()

        // Ensure minimum loading time for better UX
        const elapsed = Date.now() - (actionStartTime.current || 0)
        const remaining = Math.max(0, MIN_LOADING_TIME - elapsed)
        await new Promise((resolve) => setTimeout(resolve, remaining))

        toast({
          title: 'Success',
          description: data.message,
        })

        // Refresh the shows list
        await fetchRollingShows()
      } catch (error) {
        console.error('Error deleting show:', error)
        toast({
          title: 'Error',
          description: 'Failed to remove show from rolling monitoring',
          variant: 'destructive',
        })
      } finally {
        setLoading((prev) => ({ ...prev, deleting: false }))
        setActiveActionId(null)
        actionStartTime.current = null
      }
    },
    [fetchRollingShows],
  )

  const resetInactiveShows = useCallback(
    async (inactivityDays = 7) => {
      actionStartTime.current = Date.now()
      setLoading((prev) => ({ ...prev, resetting: true }))

      try {
        const response = await fetch(
          '/v1/session-monitoring/rolling-monitored/reset-inactive',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inactivityDays }),
          },
        )
        if (!response.ok) {
          throw new Error('Failed to reset inactive shows')
        }
        const data = await response.json()

        // Ensure minimum loading time for better UX
        const elapsed = Date.now() - (actionStartTime.current || 0)
        const remaining = Math.max(0, MIN_LOADING_TIME - elapsed)
        await new Promise((resolve) => setTimeout(resolve, remaining))

        toast({
          title: 'Success',
          description: data.message,
        })

        // Refresh both lists
        await Promise.all([
          fetchRollingShows(),
          fetchInactiveShows(inactivityDays),
        ])
      } catch (error) {
        console.error('Error resetting inactive shows:', error)
        toast({
          title: 'Error',
          description: 'Failed to reset inactive shows',
          variant: 'destructive',
        })
      } finally {
        setLoading((prev) => ({ ...prev, resetting: false }))
        actionStartTime.current = null
      }
    },
    [fetchRollingShows, fetchInactiveShows],
  )

  const runSessionMonitor =
    useCallback(async (): Promise<SessionMonitoringResult | null> => {
      actionStartTime.current = Date.now()
      setLoading((prev) => ({ ...prev, runningMonitor: true }))
      try {
        const response = await fetch('/v1/session-monitoring/run', {
          method: 'POST',
        })
        if (!response.ok) {
          throw new Error('Failed to run session monitor')
        }
        const data = await response.json()

        // Ensure minimum loading time for better UX
        const elapsed = Date.now() - (actionStartTime.current || 0)
        const remaining = Math.max(0, MIN_LOADING_TIME - elapsed)
        await new Promise((resolve) => setTimeout(resolve, remaining))

        toast({
          title: 'Success',
          description: `Session monitoring complete. Processed ${data.result.processedSessions} sessions, triggered ${data.result.triggeredSearches} searches.`,
        })

        // Refresh the shows list
        await fetchRollingShows()

        return data.result
      } catch (error) {
        console.error('Error running session monitor:', error)
        toast({
          title: 'Error',
          description: 'Failed to run session monitor',
          variant: 'destructive',
        })
        return null
      } finally {
        setLoading((prev) => ({ ...prev, runningMonitor: false }))
        actionStartTime.current = null
      }
    }, [fetchRollingShows])

  return {
    rollingShows,
    inactiveShows,
    loading,
    activeActionId,
    fetchRollingShows,
    fetchInactiveShows,
    resetShow,
    deleteShow,
    resetInactiveShows,
    runSessionMonitor,
  }
}
