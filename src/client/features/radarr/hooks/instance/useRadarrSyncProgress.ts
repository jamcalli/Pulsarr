import type { ProgressEvent } from '@root/types/progress.types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

export interface RadarrSyncProgressState {
  progress: number
  message: string
  phase: string
  operationId: string
  isComplete: boolean
}

export function useRadarrSyncProgress() {
  const [state, setState] = useState<RadarrSyncProgressState>({
    progress: 0,
    message: '',
    phase: '',
    operationId: '',
    isComplete: false,
  })

  const mountedRef = useRef(true)

  const subscribeToType = useProgressStore((state) => state.subscribeToType)

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (mountedRef.current) {
      setState({
        progress: event.progress || 0,
        message: event.message || '',
        phase: event.phase || '',
        operationId: event.operationId || '',
        isComplete: event.phase === 'complete',
      })
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToType('sync', handleEvent)
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [handleEvent, subscribeToType])

  return state
}
