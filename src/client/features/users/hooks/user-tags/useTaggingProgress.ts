import type { ProgressEvent } from '@root/types/progress.types.js'
import { useEffect, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

/**
 * React hook that provides real-time progress and status messages for a specified tagging event type.
 *
 * Subscribes to updates for the given event type and returns the latest progress percentage and message.
 *
 * @param type - The tagging event type to monitor.
 * @returns An object with the current progress value and status message.
 */
export function useTaggingProgress(type: ProgressEvent['type']) {
  const [progress, setProgress] = useState({ progress: 0, message: '' })

  useEffect(() => {
    const unsubscribe = useProgressStore
      .getState()
      .subscribeToType(type, (event) => {
        if (event.progress !== undefined) {
          setProgress((prev) => ({
            progress: event.progress,
            message: event.message || prev.message,
          }))
        }
      })

    return () => {
      unsubscribe()
    }
  }, [type])

  return progress
}
