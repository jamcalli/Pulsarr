import type { LogEntry } from '@root/types/logs.types'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendEntries,
  clearBuffer,
  EMPTY_LOG_BUFFER,
  markResumed,
} from '@/features/system/lib/logs/log-buffer'
import {
  type InitialLines,
  initialLinesPref,
} from '@/features/system/lib/logs/log-prefs'
import type { StreamStatus } from '@/features/system/lib/logs/stream-status'
import { api } from '@/lib/api'
import { usePref } from '@/lib/prefs'
import { handleSseError } from '@/lib/sse-retry'
import {
  calculateRetryDelay,
  MAX_SSE_RECONNECT_ATTEMPTS,
} from '@/lib/sse-retry-policy'

interface Run {
  id: number
  tail: number
  failedAttempts: number
}

function streamUrl(tail: number): string {
  const url = new URL(api('/v1/logs/stream'), window.location.origin)
  url.searchParams.set('tail', String(tail))
  url.searchParams.set('follow', 'true')
  return url.toString()
}

export type LogStream = ReturnType<typeof useLogStream>

export function useLogStream() {
  const [initialLines, saveInitialLines] = usePref(initialLinesPref)
  const [buffer, setBuffer] = useState(EMPTY_LOG_BUFFER)
  const [status, setStatus] = useState<StreamStatus>({ kind: 'connecting' })
  const [cleared, setCleared] = useState(false)
  const [run, setRun] = useState<Run | null>(() => ({
    id: 0,
    tail: initialLines,
    failedAttempts: 0,
  }))
  const replayed = useRef(false)
  const queue = useRef<LogEntry[]>([])
  const frame = useRef<number | null>(null)

  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const entries = queue.current
    if (entries.length === 0) return
    queue.current = []
    setBuffer((current) => appendEntries(current, entries))
  }, [])

  const dropQueue = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    queue.current = []
  }, [])

  useEffect(() => dropQueue, [dropQueue])

  useEffect(() => {
    if (!run) return
    let disposed = false
    let opened = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const source = new EventSource(streamUrl(run.tail))

    source.onopen = () => {
      opened = true
      replayed.current = true
      setStatus({ kind: 'live' })
    }
    source.onmessage = (event: MessageEvent<string>) => {
      const entry: LogEntry = JSON.parse(event.data)
      queue.current.push(entry)
      if (frame.current === null) frame.current = requestAnimationFrame(flush)
    }
    source.onerror = () => {
      source.close()
      const failedAttempts = opened ? 0 : run.failedAttempts
      const attempt = failedAttempts + 1
      const delayMs = calculateRetryDelay(attempt)
      if (attempt <= MAX_SSE_RECONNECT_ATTEMPTS) {
        setStatus({ kind: 'retrying', attempt, delayMs })
      }
      void handleSseError(failedAttempts).then(
        ({ shouldRetry, newAttempts }) => {
          if (disposed) return
          if (!shouldRetry) {
            setStatus({ kind: 'failed' })
            return
          }
          retry = setTimeout(() => {
            flush()
            setBuffer(markResumed)
            setRun({
              id: run.id + 1,
              tail: replayed.current ? 0 : run.tail,
              failedAttempts: newAttempts,
            })
          }, delayMs)
        },
      )
    }

    return () => {
      disposed = true
      source.close()
      clearTimeout(retry)
    }
  }, [run, flush])

  const restart = (tail: number) => {
    setStatus({ kind: 'connecting' })
    setRun((current) => ({
      id: (current?.id ?? 0) + 1,
      tail,
      failedAttempts: 0,
    }))
  }

  return {
    rows: buffer.rows,
    lineCount: buffer.lineCount,
    status,
    cleared,
    initialLines,
    pause: () => {
      flush()
      setStatus({ kind: 'paused' })
      setRun(null)
    },
    resume: () => {
      setBuffer(markResumed)
      restart(replayed.current ? 0 : initialLines)
    },
    clear: () => {
      setBuffer(clearBuffer)
      setCleared(true)
    },
    setInitialLines: (next: InitialLines) => {
      saveInitialLines(next)
      dropQueue()
      replayed.current = false
      setBuffer(clearBuffer)
      setCleared(false)
      restart(next)
    },
  }
}
