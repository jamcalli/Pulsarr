import { useState, useEffect, useCallback } from 'react'
import { useProgressStore } from '@/stores/progressStore'
import type { ProgressEvent } from '@root/types/progress.types'

export function useWatchlistStatus() {
  const [status, setStatus] = useState<string>('unknown')
  const subscribeToType = useProgressStore(state => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.type === 'system' && event.message?.startsWith('Watchlist workflow status:')) {
      const workflowStatus = event.message.replace('Watchlist workflow status:', '').trim()
      setStatus(workflowStatus)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToType('system', handleEvent)
    return () => unsubscribe()
  }, [subscribeToType, handleEvent])

  return status
}