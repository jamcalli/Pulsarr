import type { LogEntry } from '@root/schemas/logs/logs.schema.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import {
  calculateRetryDelay,
  handleSseError,
  MAX_SSE_RECONNECT_ATTEMPTS,
} from '@/lib/sse-retry'

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
 * React hook that opens and manages a Server-Sent Events (SSE) connection to `/v1/logs/stream`.
 *
 * Provides real-time log streaming with configurable options (tail, follow, optional filter),
 * automatic reconnection with exponential backoff (max 5 attempts, max delay 30s), and connection
 * state management. Incoming events are parsed as LogEntry and the hook retains up to the last
 * 1000 entries to avoid unbounded memory growth. The hook auto-connects on mount (unless paused)
 * and cleans up the connection on unmount.
 *
 * @param initialOptions - Partial initial LogStreamOptions (tail, follow, filter). Merged with defaults.
 * @returns An object exposing:
 *  - logs: LogEntry[] — current buffered log entries (most recent last)
 *  - isConnected, isConnecting, isPaused: booleans describing connection state
 *  - error: string | null — last connection/reconnect error message
 *  - connectionCount: number — number of successful connections established
 *  - connect(), disconnect(), pause(), resume(), clearLogs(), updateOptions() — control functions
 *  - options: LogStreamOptions — current effective options
 */
export function useLogStream(
  initialOptions: Partial<LogStreamOptions> = {},
): UseLogStreamReturn {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [hasGivenUp, setHasGivenUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionCount, setConnectionCount] = useState(0)
  const [options, setOptions] = useState<LogStreamOptions>({
    ...DEFAULT_OPTIONS,
    ...initialOptions,
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const connectionCountRef = useRef(0)

  // Keep latest options to avoid stale closures during delayed reconnects
  const optionsRef = useRef<LogStreamOptions>({
    ...DEFAULT_OPTIONS,
    ...initialOptions,
  })
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const buildStreamUrl = useCallback((streamOptions: LogStreamOptions) => {
    const url = new URL(api('/v1/logs/stream'), window.location.origin)
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
    // Don't connect if an EventSource is still present
    if (eventSourceRef.current) {
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
        const isFirstConnection = connectionCountRef.current === 0
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setHasGivenUp(false)
        connectionCountRef.current += 1
        setConnectionCount(connectionCountRef.current)
        reconnectAttempts.current = 0

        // Show success toast on first connection or after reconnect
        if (wasReconnecting || isFirstConnection) {
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
        // Immediately close to prevent browser auto-reconnect interference
        eventSource.close()
        eventSourceRef.current = null

        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }

        setIsConnected(false)
        setIsConnecting(false)

        // Only attempt reconnection if follow is enabled
        if (!optionsRef.current.follow) {
          setHasGivenUp(true)
          setError('Connection lost. Enable follow mode to auto-reconnect.')
          toast.error('Log stream connection lost')
          return
        }

        // Handle error with auth check and retry logic
        handleSseError(reconnectAttempts.current).then(
          ({ shouldRetry, newAttempts }) => {
            reconnectAttempts.current = newAttempts

            if (shouldRetry) {
              const delay = calculateRetryDelay(newAttempts)

              setError(
                `Connection lost. Reconnecting in ${Math.ceil(delay / 1000)}s... (attempt ${newAttempts}/${MAX_SSE_RECONNECT_ATTEMPTS})`,
              )

              reconnectTimeoutRef.current = setTimeout(() => {
                connect()
              }, delay)
            } else {
              setHasGivenUp(true)
              setError(
                'Connection lost. Will auto-reconnect if enabled, or pause/resume to retry.',
              )
              toast.error('Log stream connection lost')
            }
          },
        )
      }
    } catch (err) {
      setIsConnecting(false)
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to connect'
      setError(errorMessage)
      toast.error(`Failed to connect to log stream: ${errorMessage}`)
    }
  }, [buildStreamUrl, disconnect])

  const pause = useCallback(() => {
    setIsPaused(true)
    disconnect()
  }, [disconnect])

  const resume = useCallback(() => {
    setIsPaused(false)
    setHasGivenUp(false)
    reconnectAttempts.current = 0
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

      // If follow is enabled and not paused, reconnect with new options
      if (optionsRef.current.follow && !isPaused) {
        // Clear existing logs before reconnecting to prevent duplicates
        setLogs([])
        disconnect({ resetAttempts: false })
        // Use setTimeout to ensure disconnect completes before reconnecting
        // Track timeout so disconnect()/unmount can cancel it
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, 50)
      }
    },
    [disconnect, connect, isPaused],
  )

  // Auto-connect on mount and when resuming
  useEffect(() => {
    if (!isConnected && !isConnecting && !isPaused && !hasGivenUp) {
      connect()
    }
  }, [isPaused, isConnected, isConnecting, hasGivenUp, connect])

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
