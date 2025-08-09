import { useState, useRef, useEffect } from 'react'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

/**
 * React hook that performs asynchronous initialization and ensures a minimum loading duration.
 *
 * Guarantees that the initialization process takes at least the specified minimum time, providing a consistent loading state for the component.
 *
 * @param initializeFn - Asynchronous function to execute during initialization
 * @param minDuration - Minimum loading duration in milliseconds; defaults to a predefined constant
 * @returns Whether initialization is currently in progress
 */
export function useInitializeWithMinDuration(
  initializeFn: () => Promise<void>,
  minDuration = MIN_LOADING_DELAY,
) {
  const [isInitializing, setIsInitializing] = useState(true)
  const initializationStartTime = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
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
        if (!cancelled) {
          setIsInitializing(false)
          initializationStartTime.current = null
        }
      }
    }

    initializeWithMinDuration()
    return () => {
      cancelled = true
    }
  }, [initializeFn, minDuration])

  return isInitializing
}