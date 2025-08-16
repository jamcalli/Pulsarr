import type { ProgressEvent } from '@root/types/progress.types'
import { useCallback, useEffect, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

type TautulliStatus = 'running' | 'disabled' | 'unknown'

/**
 * React hook that tracks and returns the current Tautulli status.
 *
 * Subscribes to system progress events and updates the status based on messages indicating Tautulli's state.
 *
 * @returns The current Tautulli status: 'running', 'disabled', or 'unknown'.
 *
 * @remark If an invalid status is received from an event, the status is set to 'unknown'.
 */
export function useTautulliStatus(): TautulliStatus {
  const [status, setStatus] = useState<TautulliStatus>('unknown')
  const subscribeToType = useProgressStore(state => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.type === 'system' && event.message?.startsWith('Tautulli status:')) {
      const tautulliStatus = event.message.replace('Tautulli status:', '').trim()
      // Validate the status before setting
      if (['running', 'disabled', 'unknown'].includes(tautulliStatus)) {
        setStatus(tautulliStatus as TautulliStatus)
      } else {
        console.warn(`Received invalid Tautulli status: ${tautulliStatus}`)
        setStatus('unknown')
      }
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