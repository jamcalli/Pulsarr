import type { LogEntry, LogValue } from '@root/types/logs.types'

export const MAX_LOG_LINES = 1000

/** A gap row marks lines skipped while paused, from the last line before the pause to the first after it. */
export type LogRow =
  | { kind: 'line'; id: string; entry: LogEntry }
  | { kind: 'gap'; id: string; from: string; to: string }

export type LogLineRow = Extract<LogRow, { kind: 'line' }>

export interface LogBuffer {
  rows: LogRow[]
  lineCount: number
  /** Only grows, so ids stay unique across Clear. */
  nextSeq: number
  /** The last line's time before a pause, until the first line after resuming lands. */
  gapFrom: string | null
}

export const EMPTY_LOG_BUFFER: LogBuffer = {
  rows: [],
  lineCount: 0,
  nextSeq: 0,
  gapFrom: null,
}

function lastLine(rows: readonly LogRow[]): LogLineRow | undefined {
  return rows.findLast((row) => row.kind === 'line')
}

function trimToCap(rows: LogRow[], lineCount: number): LogRow[] {
  let excess = lineCount - MAX_LOG_LINES
  if (excess <= 0) return rows
  let start = 0
  while (start < rows.length && (excess > 0 || rows[start]?.kind === 'gap')) {
    if (rows[start]?.kind === 'line') excess -= 1
    start += 1
  }
  return rows.slice(start)
}

/** Keeps the newest `MAX_LOG_LINES` lines, dropping gap rows that lose the line before them. */
export function appendEntries(
  buffer: LogBuffer,
  entries: readonly LogEntry[],
): LogBuffer {
  const [first] = entries
  if (!first) return buffer
  let seq = buffer.nextSeq
  const added: LogRow[] = []
  if (buffer.gapFrom !== null) {
    added.push({
      kind: 'gap',
      id: `gap-${seq}`,
      from: buffer.gapFrom,
      to: first.timestamp,
    })
    seq += 1
  }
  for (const entry of entries) {
    added.push({ kind: 'line', id: `line-${seq}`, entry })
    seq += 1
  }
  const lineCount = buffer.lineCount + entries.length
  const rows = trimToCap([...buffer.rows, ...added], lineCount)
  return {
    rows,
    lineCount: Math.min(lineCount, MAX_LOG_LINES),
    nextSeq: seq,
    gapFrom: null,
  }
}

/** The next line to arrive gets a gap row before it, unless the page has no lines to separate it from. */
export function markResumed(buffer: LogBuffer): LogBuffer {
  return { ...buffer, gapFrom: lastLine(buffer.rows)?.entry.timestamp ?? null }
}

export function clearBuffer(buffer: LogBuffer): LogBuffer {
  return { ...EMPTY_LOG_BUFFER, nextSeq: buffer.nextSeq }
}

export function lineEntries(rows: readonly LogRow[]): LogEntry[] {
  return rows.flatMap((row) => (row.kind === 'line' ? [row.entry] : []))
}

/** A line's fields when it has any, which is what lets it open. */
export function lineData(row: LogRow): Record<string, LogValue> | null {
  if (row.kind !== 'line' || !row.entry.data) return null
  return Object.keys(row.entry.data).length > 0 ? row.entry.data : null
}
