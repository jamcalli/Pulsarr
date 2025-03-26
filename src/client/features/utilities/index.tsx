import { useEffect, useRef } from 'react'
import { UtilitiesDashboard } from '@/features/utilities/components/utilities-dashboard'
import { useConfigStore } from '@/stores/configStore'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

export default function UtilitiesPage() {
  const { initialize, isInitialized } = useConfigStore()
  const { fetchSchedules, hasLoadedSchedules } = useUtilitiesStore()
  const isInitialMount = useRef(true)

  // Initialize config on mount - only once
  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  // Fetch schedules only on first mount or if they haven't been loaded yet
  useEffect(() => {
    // Check if this is initial mount or if schedules need to be loaded
    if ((isInitialMount.current || !hasLoadedSchedules) && isInitialized) {
      fetchSchedules().catch(err => {
        console.error('Failed to fetch schedules:', err)
      })
      isInitialMount.current = false
    }
  }, [isInitialized, hasLoadedSchedules, fetchSchedules])

  return <UtilitiesDashboard />
}