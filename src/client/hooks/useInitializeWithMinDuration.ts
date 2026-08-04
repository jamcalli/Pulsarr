import { useEffect, useState } from 'react'
import { useSpinDelay } from 'spin-delay'
import { LOADER_SHOW_DELAY, MIN_LOADING_DELAY } from '@/lib/constants'

/**
 * Runs an initialization function and reports whether its loading state
 * should be visible: shown only when initialization outlasts
 * LOADER_SHOW_DELAY, then held for at least MIN_LOADING_DELAY.
 *
 * @param initializeFn - An asynchronous function representing the initialization logic
 * @returns A boolean indicating whether initialization is currently in progress
 */
export function useInitializeWithMinDuration(
  initializeFn: () => Promise<void>,
) {
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false
    initializeFn().finally(() => {
      if (!cancelled) {
        setIsInitializing(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [initializeFn])

  return useSpinDelay(isInitializing, {
    delay: LOADER_SHOW_DELAY,
    minDuration: MIN_LOADING_DELAY,
  })
}
