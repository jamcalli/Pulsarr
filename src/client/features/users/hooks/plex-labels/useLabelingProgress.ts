import type { ProgressEvent } from '@root/types/progress.types.js'
import { useEffect, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

/**
 * React hook that provides live progress percentage and status message for a specified labeling event type.
 *
 * Subscribes to updates for the given event type and returns the latest progress and message, updating in real time as events occur.
 *
 * @param type - The labeling event type to monitor.
 * @returns An object with the current progress value and status message.
 */
export function useLabelingProgress(type: ProgressEvent['type']) {
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
