import { z } from 'zod'

// Log levels schema
export const LogLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
])

// Query parameters for log streaming
export const LogStreamQuerySchema = z.object({
  tail: z.coerce
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .default(100)
    .describe('Number of recent log lines to send initially. Defaults to 100.'),
  follow: z.coerce
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Whether to follow the log file for new entries. Defaults to true.',
    ),
  filter: z
    .string()
    .trim()
    .max(512)
    .optional()
    .describe(
      'Optional string filter to match against log messages (max 512 chars).',
    ),
})

// Individual log entry schema
export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: LogLevelSchema,
  message: z.string(),
  module: z.string().optional(),
  data: z.any().optional(),
})

// SSE message schema for logs
export const LogSSEMessageSchema = z.object({
  id: z.string(),
  data: z.string(), // JSON stringified LogEntry
})

// Response schema for documentation
export const LogStreamResponseSchema = z.object({
  message: z.string().describe('SSE stream of log entries'),
})

// Export types
export type LogLevel = z.infer<typeof LogLevelSchema>
export type LogStreamQuery = z.infer<typeof LogStreamQuerySchema>
export type LogEntry = z.infer<typeof LogEntrySchema>
export type LogSSEMessage = z.infer<typeof LogSSEMessageSchema>
export type LogStreamResponse = z.infer<typeof LogStreamResponseSchema>
