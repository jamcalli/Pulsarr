import { useState, useEffect } from 'react'
import { useProgressStore } from '@/stores/progressStore'

// Define the specific string literal type that matches what subscribeToType accepts
type ProgressEventType =
  | 'self-watchlist'
  | 'others-watchlist'
  | 'rss-feed'
  | 'system'
  | 'sync'
  | 'sonarr-tagging'
  | 'radarr-tagging'
  | 'sonarr-tag-removal'
  | 'radarr-tag-removal'

/**
 * React hook that provides real-time progress updates for a specified tagging event type.
 *
 * Subscribes to progress events of the given {@link type} and returns the current progress percentage and status message.
 *
 * @param type - The tagging progress event type to monitor.
 * @returns An object with the current progress value and message for the specified event type.
 */
export function useTaggingProgress(type: ProgressEventType) {
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
