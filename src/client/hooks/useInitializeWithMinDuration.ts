import { useState, useRef, useEffect } from 'react'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

/**
 * React hook that manages asynchronous initialization with a guaranteed minimum loading duration.
 *
 * Ensures that the initialization process takes at least the specified minimum time, providing a consistent loading experience.
 *
 * @param initializeFn - An asynchronous function representing the initialization logic
 * @param minDuration - Optional minimum loading duration in milliseconds; defaults to a predefined constant
 * @returns A boolean indicating whether initialization is currently in progress
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