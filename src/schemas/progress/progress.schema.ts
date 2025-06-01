import { z } from 'zod'

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
  message: z.string().describe('SSE stream of progress events'),
})

// Export types
export type ProgressEvent = z.infer<typeof ProgressEventSchema>
export type SSEMessage = z.infer<typeof SSEMessageSchema>
export type ProgressStreamResponse = z.infer<
  typeof ProgressStreamResponseSchema
>
