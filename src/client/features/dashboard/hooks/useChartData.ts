import { useEffect } from 'react'
import { useDashboardStore } from '../store/dashboardStore'

export function useStatusTransitionData() {
  const { 
    statusTransitions, 
    loading, 
    errors, 
    fetchStatusTransitions 
  } = useDashboardStore()

  useEffect(() => {
    if (!statusTransitions) {
      fetchStatusTransitions()
    }
  }, [statusTransitions, fetchStatusTransitions])

  return {
    data: statusTransitions,
    isLoading: loading.statusTransitions,
    error: errors.statusTransitions
  }
}

export function useContentDistributionData() {
  const { 
    contentTypeDistribution, 
    loading, 
    errors, 
    fetchContentTypeDistribution 
  } = useDashboardStore()

  useEffect(() => {
    if (!contentTypeDistribution) {
      fetchContentTypeDistribution()
    }
  }, [contentTypeDistribution, fetchContentTypeDistribution])

  return {
    data: contentTypeDistribution,
    isLoading: loading.contentDistribution,
    error: errors.contentDistribution
  }
}

export function useNotificationStatsData() {
  const { 
    notificationStats, 
    loading, 
    errors, 
    fetchNotificationStats 
  } = useDashboardStore()

  useEffect(() => {
    if (!notificationStats) {
      fetchNotificationStats()
    }
  }, [notificationStats, fetchNotificationStats])

  return {
    data: notificationStats,
    isLoading: loading.notifications,
    error: errors.notifications
  }
}

export function useTopGenresData() {
  const { 
    topGenres, 
    loading, 
    errors, 
    fetchTopGenres 
  } = useDashboardStore()

  useEffect(() => {
    if (!topGenres) {
      fetchTopGenres()
    }
  }, [topGenres, fetchTopGenres])

  return {
    data: topGenres,
    isLoading: loading.genres,
    error: errors.genres
  }
}

export function useInstanceContentData() {
  const { 
    instanceContentBreakdown, 
    loading, 
    errors, 
    fetchInstanceContentBreakdown 
  } = useDashboardStore()

  useEffect(() => {
    if (!instanceContentBreakdown) {
      fetchInstanceContentBreakdown()
    }
  }, [instanceContentBreakdown, fetchInstanceContentBreakdown])

  return {
    data: instanceContentBreakdown,
    isLoading: loading.instanceContent,
    error: errors.instanceContent
  }
}