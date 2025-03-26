import { useEffect, useRef } from 'react'
import { UtilitiesDashboard } from '@/features/utilities/components/utilities-dashboard'
import { useConfigStore } from '@/stores/configStore'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'

/**
 * Renders the utilities dashboard while ensuring configuration is initialized and schedules are fetched.
 *
 * On mount, the component checks if the configuration has been initialized and calls the initialization function if not.
 * It then conditionally fetches the schedules if it is the first mount or if the schedules have not already been loaded,
 * executing this only after the configuration is confirmed as initialized.
 *
 * @remarks
 * Any errors encountered during the schedule fetch are logged to the console.
 */
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
      fetchSchedules().catch((err) => {
        console.error('Failed to fetch schedules:', err)
      })
      isInitialMount.current = false
    }
  }, [isInitialized, hasLoadedSchedules, fetchSchedules])

  return <UtilitiesDashboard />
}
