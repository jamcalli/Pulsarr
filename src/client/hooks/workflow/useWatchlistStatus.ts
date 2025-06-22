import { useState, useEffect, useCallback } from 'react'
import { useProgressStore } from '@/stores/progressStore'
import type { ProgressEvent } from '@root/types/progress.types'

/**
 * Custom React hook that monitors and provides the current watchlist workflow status and synchronization state.
 *
 * This hook subscribes to system events from the progress store and listens for messages that start with "Watchlist workflow status:".
 * When such an event occurs, it extracts the workflow status to update the `status` state. Additionally, if the event contains metadata,
 * the hook updates the `syncMode` (indicating either "manual" or "rss") and `rssAvailable` state values.
 *
 * @returns An object containing the current watchlist status:
 *   - status: The extracted workflow status as a string.
 *   - syncMode: The current synchronization mode, either "manual" or "rss".
 *   - rssAvailable: A boolean flag indicating if RSS functionality is available.
 */
export function useWatchlistStatus() {
  const [status, setStatus] = useState<string>('unknown')
  const [syncMode, setSyncMode] = useState<'manual' | 'rss'>('manual')
  const [rssAvailable, setRssAvailable] = useState<boolean>(false)
  const subscribeToType = useProgressStore(state => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.type === 'system' && event.message?.startsWith('Watchlist workflow status:')) {
      const workflowStatus = event.message.replace('Watchlist workflow status:', '').trim()
      setStatus(workflowStatus)
      
      if (event.metadata && 'syncMode' in event.metadata && 'rssAvailable' in event.metadata) {
        setSyncMode(event.metadata.syncMode)
        setRssAvailable(event.metadata.rssAvailable)
      }
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToType('system', handleEvent)
    return () => {
      unsubscribe()
    }
  }, [subscribeToType, handleEvent])

  return { status, syncMode, rssAvailable }
}
