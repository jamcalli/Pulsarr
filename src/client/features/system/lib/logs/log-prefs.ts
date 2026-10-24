import {
  DEFAULT_LOG_TAIL_LINES,
  LOG_TAIL_LINES,
} from '@root/schemas/logs/logs.schema'
import { formatNumber } from '@/lib/format'
import { type PrefDef, parseOneOfNumbers } from '@/lib/prefs'

export const INITIAL_LINES = [
  LOG_TAIL_LINES.min,
  50,
  DEFAULT_LOG_TAIL_LINES,
  200,
  500,
] as const

export type InitialLines = (typeof INITIAL_LINES)[number]

export const parseInitialLines = parseOneOfNumbers(INITIAL_LINES)

export const initialLinesPref: PrefDef<InitialLines> = {
  key: 'pulsarr-logs-initial-lines',
  fallback: DEFAULT_LOG_TAIL_LINES,
  parse: parseInitialLines,
  serialize: String,
}

export function initialLineOptions() {
  return INITIAL_LINES.map((lines) =>
    lines === LOG_TAIL_LINES.min
      ? { value: String(lines), label: 'None' }
      : { value: String(lines), label: formatNumber(lines) },
  )
}
