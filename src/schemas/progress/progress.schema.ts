import { z } from 'zod'

// Log levels enum - matches Pino's LevelWithSilent but excludes 'silent' for streaming
// Note: 'silent' omitted as it disables all logging (not useful for streaming)
export const LogLevelEnum = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
])

// Event types enum
export const EventTypeEnum = z.enum(['progress', 'log'])

// Querystring schema for event streaming
export const StreamQuerystringSchema = z.object({
  events: z
    .array(EventTypeEnum)
    .optional()
    .default(['progress', 'log'])
    .describe(
      'Types of events to stream. Defaults to both progress and log events.',
    ),
  logLevel: LogLevelEnum.optional()
    .default('info')
    .describe(
      'Minimum log level for log events. Only applies when log events are enabled.',
    ),
})

// Progress event schema
export const ProgressEventSchema = z.object({
  operationId: z.string(),
  operation: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  details: z.any().optional(),
})

// SSE message schema
export const SSEMessageSchema = z.object({
  id: z.string(),
  data: z.string(), // JSON stringified ProgressEvent
})

// Response schema for documentation
export const ProgressStreamResponseSchema = z.object({
  message: z.string().describe('SSE stream of progress and log events'),
})

// Export types
export type StreamQuerystring = z.infer<typeof StreamQuerystringSchema>
export type ProgressEvent = z.infer<typeof ProgressEventSchema>
export type SSEMessage = z.infer<typeof SSEMessageSchema>
export type ProgressStreamResponse = z.infer<
  typeof ProgressStreamResponseSchema
>
