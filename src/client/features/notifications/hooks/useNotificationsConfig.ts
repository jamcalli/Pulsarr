import { useEffect, useState } from 'react'
import { useConfigStore } from '@/stores/configStore'

export function useNotificationsConfig() {
  const [isInitialized, setIsInitialized] = useState(false)
  const config = useConfigStore((state) => state.config)
  const initialize = useConfigStore((state) => state.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (config) {
      setIsInitialized(true)
    }
  }, [config])

  return {
    isInitialized,
    config,
  }
}
