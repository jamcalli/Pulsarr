export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type LogValue =
  | string
  | number
  | boolean
  | null
  | LogValue[]
  | { [key: string]: LogValue }

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  module?: string
  /** Every field of the pino line beyond its standard ones. */
  data?: Record<string, LogValue>
}
