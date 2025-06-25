import { useState, useEffect, useCallback } from 'react'
import { useProgressStore } from '@/stores/progressStore'
import type { ProgressEvent } from '@root/types/progress.types'

/**
 * React hook that provides the current watchlist workflow status and synchronization state.
 *
 * Subscribes to system events to track changes in the watchlist workflow status, synchronization mode, and RSS availability.
 *
 * @returns An object with the current `status`, `syncMode`, and `rssAvailable` values.
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
