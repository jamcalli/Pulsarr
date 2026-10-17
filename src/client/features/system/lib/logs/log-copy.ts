import type { LogEntry } from '@root/types/logs.types'
import type { StatusPillView } from '@/components/status-pill'
import { MAX_LOG_LINES } from '@/features/system/lib/logs/log-buffer'
import {
  type ConfigLogLevel,
  isVerboseLevel,
  LOG_LEVEL_LABELS,
} from '@/features/system/lib/logs/log-levels'
import type { StreamStatus } from '@/features/system/lib/logs/stream-status'
import { formatCount, formatLogTime } from '@/lib/format'
import { MAX_SSE_RECONNECT_ATTEMPTS } from '@/lib/sse-retry-policy'

const LABEL_LENGTH = 48

export const STREAM_PILLS: Record<StreamStatus['kind'], StatusPillView> = {
  connecting: { tone: 'pending', label: 'Connecting' },
  live: { tone: 'on', label: 'Live' },
  paused: { tone: 'off', label: 'Paused' },
  retrying: { tone: 'pending', label: 'Reconnecting' },
  failed: { tone: 'failed', label: 'Disconnected' },
}

export function expandedLabel(entry: LogEntry): string {
  const message =
    entry.message.length > LABEL_LENGTH
      ? `${entry.message.slice(0, LABEL_LENGTH)}...`
      : entry.message
  return `Data for "${message}"`
}

export function gapText(from: string, to: string): string {
  return `Paused from ${formatLogTime(new Date(from), false)} to ${formatLogTime(new Date(to), false)}.`
}

export function retryText(attempt: number, delayMs: number): string {
  const wait = formatCount(Math.floor(delayMs / 1000), 'second')
  return `Trying again in ${wait}, attempt ${attempt} of ${MAX_SSE_RECONNECT_ATTEMPTS}.`
}

export const FAILED_TEXT = `Pulsarr didn't answer after ${MAX_SSE_RECONNECT_ATTEMPTS} attempts.`

/** Null until the page holds `MAX_LOG_LINES`. */
export function capNote(total: number): string | null {
  if (total < MAX_LOG_LINES) return null
  return `Only the newest ${formatCount(MAX_LOG_LINES, 'line')} are kept.`
}

export const JUMP_LABEL = 'Jump to newest'

const SILENT_TEXT = 'Silent writes nothing.'

export function emptyStreamText({
  cleared,
  waitingOnly,
  silent,
}: {
  cleared: boolean
  /** Initial lines is None, so the stream only brings new lines. */
  waitingOnly: boolean
  silent: boolean
}): { title: string; description?: string } {
  if (cleared) {
    return {
      title: 'Page cleared',
      description: 'The log file is untouched.',
    }
  }
  if (waitingOnly) {
    return {
      title: 'Waiting for new lines',
      description: silent ? SILENT_TEXT : undefined,
    }
  }
  return {
    title: 'No lines yet',
    description: silent ? SILENT_TEXT : undefined,
  }
}

/** The warning under Application log level for a verbose or silent level, null for the rest. */
export function levelWarning(
  level: ConfigLogLevel,
  restore: ConfigLogLevel,
): string | null {
  if (level === 'silent') return SILENT_TEXT
  if (!isVerboseLevel(level)) return null
  return `${LOG_LEVEL_LABELS[level].label} writes many more lines, so set it back to ${LOG_LEVEL_LABELS[restore].label} after.`
}
