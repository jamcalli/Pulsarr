import type { ProgressEvent } from '@root/types/progress.types'
import { useCallback, useEffect, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

export function usePlexSSEStatus() {
  const [status, setStatus] = useState<string>('unknown')
  const subscribeToType = useProgressStore(state => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.type === 'system' && event.message?.startsWith('Plex SSE status:')) {
      const sseStatus = event.message.replace('Plex SSE status:', '').trim()
      setStatus(sseStatus)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToType('system', handleEvent)
    return () => {
      unsubscribe()
    }
  }, [subscribeToType, handleEvent])

  return status
}
