import type { LogEntry, LogValue } from '@root/types/logs.types'
import { formatLogExportTime } from '@/lib/format'

function exportValue(value: LogValue): string {
  return typeof value === 'string' ||
    (typeof value === 'object' && value !== null)
    ? JSON.stringify(value)
    : String(value)
}

export function logEntryText(entry: LogEntry): string {
  const module = entry.module ? `[${entry.module}] ` : ''
  const head = `[${formatLogExportTime(new Date(entry.timestamp))}] ${entry.level.toUpperCase()}: ${module}${entry.message}`
  const fields = Object.entries(entry.data ?? {}).map(
    ([key, value]) => `\n    ${key}: ${exportValue(value)}`,
  )
  return head + fields.join('')
}

export function logLinesText(entries: readonly LogEntry[]): string {
  return entries.map(logEntryText).join('\n\n')
}

export function logExportFileName(now: Date): string {
  return `pulsarr-logs-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
}

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
