import type { LogEntry, LogLevel } from '@root/types/logs.types.js'
import { z } from 'zod'

export const LOG_TAIL_LINES = { min: 0, max: 1000 } as const
export const DEFAULT_LOG_TAIL_LINES = 100

export const LogLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
]) satisfies z.ZodType<LogLevel>

export const LogStreamQuerySchema = z.object({
  tail: z.coerce
    .number()
    .int()
    .min(LOG_TAIL_LINES.min)
    .max(LOG_TAIL_LINES.max)
    .optional()
    .default(DEFAULT_LOG_TAIL_LINES)
    .meta({
      description: `Number of recent log lines to send initially. Defaults to ${DEFAULT_LOG_TAIL_LINES}.`,
    }),
  follow: z.stringbool().optional().default(true).meta({
    description:
      'Whether to follow the log file for new entries. Defaults to true.',
  }),
  filter: z.string().trim().max(512).optional().meta({
    description:
      'Optional string filter to match against log messages (max 512 chars). Applies within the tail window of recent lines, so older matches are not backfilled and fewer than tail lines may be returned.',
  }),
})

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: LogLevelSchema,
  message: z.string(),
  module: z.string().optional(),
  data: z.record(z.string(), z.json()).optional(),
}) satisfies z.ZodType<LogEntry>

export const LogSSEMessageSchema = z.object({
  id: z.string(),
  data: z.string(), // JSON stringified LogEntry
})

export const LogStreamResponseSchema = z.object({
  message: z.string().meta({ description: 'SSE stream of log entries' }),
})

export type LogStreamQuery = z.infer<typeof LogStreamQuerySchema>
export type LogSSEMessage = z.infer<typeof LogSSEMessageSchema>
export type LogStreamResponse = z.infer<typeof LogStreamResponseSchema>
