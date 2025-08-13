import type { ProgressEvent } from '@root/types/progress.types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgressStore } from '@/stores/progressStore'

type ProgressType = ProgressEvent['type']

interface ProgressState {
  progress: number
  message: string
  phase: string
  isConnected: boolean
}

export const useProgress = (type: ProgressType): ProgressState => {
  const [state, setState] = useState<ProgressState>({
    progress: 0,
    message: '',
    phase: '',
    isConnected: false
  })
  
  const mountedRef = useRef(true)
  
  const subscribeToType = useProgressStore(state => state.subscribeToType)
  const isStoreConnected = useProgressStore(state => state.isConnected)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    
    if (mountedRef.current) {
      unsubscribe = subscribeToType(type, (event: ProgressEvent) => {
        if (mountedRef.current) {
          setState({
            progress: event.progress || 0,
            message: event.message || '',
            phase: event.phase || '',
            isConnected: true
          })
        }
      })
      
      setState(prev => ({ ...prev, isConnected: isStoreConnected }))
    }

    return () => {
      mountedRef.current = false
      if (unsubscribe) unsubscribe()
    }
  }, [type, subscribeToType, isStoreConnected])
  
  return state
}

export const useWatchlistProgress = (type: ProgressType): ProgressState & {
  isProcessing: boolean
  isComplete: boolean
} => {
  const progress = useProgress(type)
  
  const isProcessing = progress.phase === 'processing'
  const isComplete = progress.phase === 'complete'

  return {
    ...progress,
    isProcessing,
    isComplete
  }
}

export const useOperationProgress = (operationId: string): ProgressState => {
  const [state, setState] = useState<ProgressState>({
    progress: 0,
    message: '',
    phase: '',
    isConnected: false
  })
  const mountedRef = useRef(true)

  const subscribeToOperation = useProgressStore(state => state.subscribeToOperation)
  const isStoreConnected = useProgressStore(state => state.isConnected)

  const handleProgress = useCallback((event: ProgressEvent) => {
    if (mountedRef.current) {
      setState({
        progress: event.progress || 0,
        message: event.message || '',
        phase: event.phase || '',
        isConnected: true
      })
    }
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    
    if (mountedRef.current) {
      unsubscribe = subscribeToOperation(operationId, handleProgress)
      setState(prev => ({ ...prev, isConnected: isStoreConnected }))
    }

    return () => {
      mountedRef.current = false
      if (unsubscribe) unsubscribe()
    }
  }, [operationId, handleProgress, subscribeToOperation, isStoreConnected])

  return state
}