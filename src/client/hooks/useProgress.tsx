import { useState, useEffect, useCallback, useRef } from 'react'
import { eventSourceManager } from '@/lib/eventSourceManager'
import type { ProgressEvent } from '@/lib/eventSourceManager'

export const useProgress = (operationId: string) => {
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [phase, setPhase] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const mountedRef = useRef(true)

  const handleProgress = useCallback((event: ProgressEvent) => {
    console.log(`[useProgress] Received update for ${operationId}:`, event)
    if (mountedRef.current) {
      setProgress(event.progress)
      setMessage(event.message)
      setPhase(event.phase)
      console.log(`[useProgress] State updated for ${operationId}`, {
        progress: event.progress,
        message: event.message,
        phase: event.phase
      })
    }
  }, [operationId])

  useEffect(() => {
    console.log(`[useProgress] Setting up subscription for ${operationId}`)
    const unsubscribe = eventSourceManager.subscribe(operationId, handleProgress)
    setIsConnected(eventSourceManager.isConnected())

    return () => {
      console.log(`[useProgress] Cleaning up subscription for ${operationId}`)
      mountedRef.current = false
      unsubscribe()
    }
  }, [operationId, handleProgress])

  return {
    progress,
    message,
    phase,
    isConnected
  }
}