import type { LogEntry } from '@root/types/logs.types'
import { createContext } from 'react'
import type { LogRow } from '@/features/system/lib/logs/log-buffer'
import {
  isAtOrAbove,
  type LevelThreshold,
} from '@/features/system/lib/logs/log-levels'

export interface LogFilters {
  q: string
  level: LevelThreshold | null
}

export const NO_LOG_FILTERS: LogFilters = { q: '', level: null }

/** The lowercased search, or null when the box is blank. */
export function searchNeedle(q: string): string | null {
  const needle = q.trim().toLowerCase()
  return needle === '' ? null : needle
}

/** The `searchNeedle` the message cells highlight, so columns stay stable while typing. */
export const SearchNeedleContext = createContext<string | null>(null)

export function hasLogFilters(filters: LogFilters): boolean {
  return filters.level !== null || searchNeedle(filters.q) !== null
}

function matchesSearch(entry: LogEntry, needle: string): boolean {
  const haystack = [
    entry.level,
    entry.module ?? '',
    entry.message,
    entry.data ? JSON.stringify(entry.data) : '',
  ]
  return haystack.some((text) => text.toLowerCase().includes(needle))
}

/** Gap rows stay so the pause still shows between the lines that match. */
export function filterLogRows(rows: LogRow[], filters: LogFilters): LogRow[] {
  const needle = searchNeedle(filters.q)
  const { level } = filters
  if (needle === null && level === null) return rows
  return rows.filter(
    (row) =>
      row.kind === 'gap' ||
      ((level === null || isAtOrAbove(row.entry.level, level)) &&
        (needle === null || matchesSearch(row.entry, needle))),
  )
}

export interface TextPart {
  text: string
  match: boolean
  start: number
}

/** Splits text around each case-insensitive occurrence of a lowercased needle. */
export function splitMatches(text: string, needle: string): TextPart[] {
  const parts: TextPart[] = []
  const lower = text.toLowerCase()
  let start = 0
  let found = lower.indexOf(needle)
  while (needle !== '' && found !== -1) {
    if (found > start) {
      parts.push({ text: text.slice(start, found), match: false, start })
    }
    const end = found + needle.length
    parts.push({ text: text.slice(found, end), match: true, start: found })
    start = end
    found = lower.indexOf(needle, start)
  }
  if (start < text.length) {
    parts.push({ text: text.slice(start), match: false, start })
  }
  return parts
}
