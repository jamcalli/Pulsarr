import { useEffect, useState } from 'react'
import { useConfig } from '@/hooks/useConfig'

export function useNotificationsConfig() {
  const [isInitialized, setIsInitialized] = useState(false)
  const { config } = useConfig()
  const { initialize } = useConfig()

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
