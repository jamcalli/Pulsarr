import type { ProgressEvent } from '@root/types/progress.types'
import { useCallback, useEffect, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

type PlexMobileStatus = 'enabled' | 'disabled' | 'no_plex_pass' | 'not_configured' | 'unknown'

export function usePlexMobileStatus(): PlexMobileStatus {
  const [status, setStatus] = useState<PlexMobileStatus>('unknown')
  const subscribeToType = useProgressStore(state => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.message.startsWith('Plex mobile status:')) {
      const mobileStatus = event.message.replace('Plex mobile status:', '').trim()
      if (['enabled', 'disabled', 'no_plex_pass', 'not_configured'].includes(mobileStatus)) {
        setStatus(mobileStatus as PlexMobileStatus)
      } else {
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
