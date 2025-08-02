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
  | 'plex-label-sync'
  | 'plex-label-removal'

/**
 * React hook that returns real-time progress and status message for a given labeling event type.
 *
 * Subscribes to progress updates for the specified {@link type} and provides the latest progress percentage and message.
 *
 * @param type - The labeling event type to track.
 * @returns An object containing the current progress value and message.
 */
export function useLabelingProgress(type: ProgressEventType) {
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
