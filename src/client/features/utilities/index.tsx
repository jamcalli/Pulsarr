import { useEffect } from 'react'
import { UtilitiesDashboard } from '@/features/utilities/components/utilities-dashboard'
import { useConfigStore } from '@/stores/configStore'

export default function UtilitiesPage() {
  const { initialize, isInitialized } = useConfigStore()

  // Initialize config on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  return <UtilitiesDashboard />
}
