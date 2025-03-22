import { useState, useEffect, useCallback, useRef } from 'react'
import { useProgressStore } from '@/stores/progressStore'
import type { ProgressEvent } from '@root/types/progress.types'

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
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [phase, setPhase] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const mountedRef = useRef(true)

  const subscribeToOperation = useProgressStore(state => state.subscribeToOperation)
  const isStoreConnected = useProgressStore(state => state.isConnected)

  const handleProgress = useCallback((event: ProgressEvent) => {
    if (mountedRef.current) {
      setProgress(event.progress)
      setMessage(event.message)
      setPhase(event.phase)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToOperation(operationId, handleProgress)
    setIsConnected(isStoreConnected)

    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [operationId, handleProgress, subscribeToOperation, isStoreConnected])

  useEffect(() => {
    return () => {
      if (mountedRef.current) {
        setProgress(0)
        setMessage('')
        setPhase('')
      }
    }
  }, [])

  return {
    progress,
    message,
    phase,
    isConnected
  }
}