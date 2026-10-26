import { useMemo, useRef, useState } from 'react'
import { useLogFollow } from '@/features/system/hooks/logs/useLogFollow'
import { useLogStream } from '@/features/system/hooks/logs/useLogStream'
import { lineEntries } from '@/features/system/lib/logs/log-buffer'
import {
  filterLogRows,
  hasLogFilters,
  type LogFilters,
  NO_LOG_FILTERS,
  searchNeedle,
} from '@/features/system/lib/logs/log-filter'
import type { InitialLines } from '@/features/system/lib/logs/log-prefs'
import { useConfig } from '@/hooks/useConfig'

export type LogsPage = ReturnType<typeof useLogsPage>

export function useLogsPage() {
  const config = useConfig()
  const stream = useLogStream()
  const [filters, setFilters] = useState<LogFilters>(NO_LOG_FILTERS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shown = useMemo(
    () => filterLogRows(stream.rows, filters),
    [stream.rows, filters],
  )
  const follow = useLogFollow(scrollRef, expandedId)

  return {
    config: config.config,
    isReady: config.isReady,
    errorMessage: config.error,
    retry: () => config.initialize(true),
    stream,
    filters,
    filtered: hasLogFilters(filters),
    needle: searchNeedle(filters.q),
    setFilters: (next: Partial<LogFilters>) =>
      setFilters((current) => ({ ...current, ...next })),
    clearFilters: () => setFilters(NO_LOG_FILTERS),
    shown,
    shownEntries: lineEntries(shown),
    total: stream.lineCount,
    scrollRef,
    follow,
    expandedId,
    setExpandedId: (id: string | null) => {
      if (id !== null) follow.stop()
      setExpandedId(id)
    },
    clear: () => {
      stream.clear()
      setExpandedId(null)
      follow.follow()
    },
    changeInitialLines: (next: InitialLines) => {
      stream.setInitialLines(next)
      setExpandedId(null)
      follow.follow()
    },
  }
}
