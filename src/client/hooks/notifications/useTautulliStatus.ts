import { useState, useEffect, useCallback } from 'react'
import { useProgressStore } from '@/stores/progressStore'
import type { ProgressEvent } from '@root/types/progress.types'

type TautulliStatus = 'running' | 'disabled' | 'unknown'

export function useTautulliStatus(): TautulliStatus {
  const [status, setStatus] = useState<TautulliStatus>('unknown')
  const subscribeToType = useProgressStore(state => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.type === 'system' && event.message?.startsWith('Tautulli status:')) {
      const tautulliStatus = event.message.replace('Tautulli status:', '').trim()
      setStatus(tautulliStatus as TautulliStatus)
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