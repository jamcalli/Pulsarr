import type { LogEntry } from '@root/schemas/logs/logs.schema.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface LogStreamOptions {
  tail: number
  follow: boolean
  filter?: string
}

interface UseLogStreamReturn {
  logs: LogEntry[]
  isConnected: boolean
  isConnecting: boolean
  isPaused: boolean
  error: string | null
  connectionCount: number
  connect: () => void
  disconnect: () => void
  pause: () => void
  resume: () => void
  clearLogs: () => void
  updateOptions: (options: Partial<LogStreamOptions>) => void
  options: LogStreamOptions
}

const DEFAULT_OPTIONS: LogStreamOptions = {
  tail: 100,
  follow: true,
}

/**
 * React hook for managing Server-Sent Events connection to the log streaming endpoint.
 *
 * Provides real-time log streaming with configurable filtering, automatic reconnection,
 * and connection state management. Follows the established SSE patterns used in other
 * utilities hooks.
 */
export function useLogStream(
  initialOptions: Partial<LogStreamOptions> = {},
): UseLogStreamReturn {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionCount, setConnectionCount] = useState(0)
  const [options, setOptions] = useState<LogStreamOptions>({
    ...DEFAULT_OPTIONS,
    ...initialOptions,
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  // Keep latest options to avoid stale closures during delayed reconnects
  const optionsRef = useRef<LogStreamOptions>({
    ...DEFAULT_OPTIONS,
    ...initialOptions,
  })
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const buildStreamUrl = useCallback((streamOptions: LogStreamOptions) => {
    const url = new URL('/v1/logs/stream', window.location.origin)
    url.searchParams.set('tail', streamOptions.tail.toString())
    url.searchParams.set('follow', streamOptions.follow.toString())
    if (streamOptions.filter) {
      url.searchParams.set('filter', streamOptions.filter)
    }
    return url.toString()
  }, [])

  const disconnect = useCallback((opts: { resetAttempts?: boolean } = {}) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    setIsConnected(false)
    setIsConnecting(false)
    setError(null)
    if (opts.resetAttempts !== false) {
      reconnectAttempts.current = 0
    }
    // Don't reset isPaused here - that's controlled by pause/resume functions
  }, [])

  const connect = useCallback(() => {
    // Don't connect if already connecting or connected
    if (isConnecting || isConnected) {
      return
    }

    // Clear any previous connection
    disconnect({ resetAttempts: false })

    setIsConnecting(true)
    setError(null)

    try {
      const streamUrl = buildStreamUrl(optionsRef.current)
      const eventSource = new EventSource(streamUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        const wasReconnecting = reconnectAttempts.current > 0
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setConnectionCount((prev) => prev + 1)
        reconnectAttempts.current = 0

        // Show success toast on first connection or after reconnect
        if (wasReconnecting || connectionCount === 0) {
          toast.success('Connected to log stream')
        }
      }

      eventSource.onmessage = (event) => {
        try {
          const logEntry: LogEntry = JSON.parse(event.data)
          setLogs((prev) => {
            // Keep last 1000 logs to prevent memory issues
            const newLogs = [...prev, logEntry]
            return newLogs.slice(-1000)
          })
        } catch (err) {
          console.warn('Failed to parse log entry:', err)
        }
      }

      eventSource.onerror = () => {
        setIsConnected(false)
        setIsConnecting(false)

        // Only attempt reconnection if follow is enabled and we haven't exceeded max attempts
        if (
          optionsRef.current.follow &&
          reconnectAttempts.current < maxReconnectAttempts
        ) {
          reconnectAttempts.current += 1
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000) // Exponential backoff, max 30s

          setError(
            `Connection lost. Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`,
          )

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else {
          setError(
            'Connection lost. Will auto-reconnect if enabled, or pause/resume to retry.',
          )
          toast.error('Log stream connection lost')
        }
      }
    } catch (err) {
      setIsConnecting(false)
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to connect'
      setError(errorMessage)
      toast.error(`Failed to connect to log stream: ${errorMessage}`)
    }
  }, [isConnecting, isConnected, buildStreamUrl, disconnect, connectionCount])

  const pause = useCallback(() => {
    setIsPaused(true)
    disconnect()
  }, [disconnect])

  const resume = useCallback(() => {
    setIsPaused(false)
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
    toast.success('Log history cleared')
  }, [])

  const updateOptions = useCallback(
    (newOptions: Partial<LogStreamOptions>) => {
      setOptions((prev) => {
        const next = { ...prev, ...newOptions }
        optionsRef.current = next
        return next
      })

      // If connected and follow is enabled, reconnect with new options
      if (isConnected && optionsRef.current.follow) {
        // Clear existing logs before reconnecting to prevent duplicates
        setLogs([])
        disconnect({ resetAttempts: false })
        connect()
      }
    },
    [isConnected, disconnect, connect],
  )

  // Auto-connect on mount and when resuming
  useEffect(() => {
    if (!isConnected && !isConnecting && !isPaused) {
      connect()
    }
  }, [isPaused, isConnected, isConnecting, connect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    logs,
    isConnected,
    isConnecting,
    isPaused,
    error,
    connectionCount,
    connect,
    disconnect,
    pause,
    resume,
    clearLogs,
    updateOptions,
    options,
  }
}
