import { useState, useRef, useEffect } from 'react'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

/**
 * Custom hook for initializing components with a minimum loading duration
 * to provide consistent UX across utility pages
 */
export function useInitializeWithMinDuration(
  initializeFn: () => Promise<void>,
  minDuration = MIN_LOADING_DELAY,
) {
  const [isInitializing, setIsInitializing] = useState(true)
  const initializationStartTime = useRef<number | null>(null)

  useEffect(() => {
    const initializeWithMinDuration = async () => {
      setIsInitializing(true)
      initializationStartTime.current = Date.now()

      try {
        await initializeFn()

        // Ensure minimum loading time for better UX
        const elapsed = Date.now() - (initializationStartTime.current || 0)
        const remaining = Math.max(0, minDuration - elapsed)
        await new Promise((resolve) => setTimeout(resolve, remaining))
      } finally {
        setIsInitializing(false)
        initializationStartTime.current = null
      }
    }

    initializeWithMinDuration()
  }, [initializeFn, minDuration])

  return isInitializing
}