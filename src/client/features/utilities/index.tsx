import { useEffect } from 'react'
import { UtilitiesDashboard } from '@/features/utilities/components/utilities-dashboard'
import { useConfigStore } from '@/stores/configStore'

export function UtilitiesPage() {
  const { initialize, isInitialized } = useConfigStore()
  
  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])
  
  return <UtilitiesDashboard />
}

export default UtilitiesPage