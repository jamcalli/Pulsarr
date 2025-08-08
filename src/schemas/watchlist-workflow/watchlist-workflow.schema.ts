import { z } from 'zod'
import { ErrorSchema } from '@schemas/common/error.schema.js'

// Schema for Watchlist workflow status responses
export const WatchlistWorkflowResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(['running', 'stopped', 'starting', 'stopping']),
  message: z.string().optional(),
})

// Type exports
export type WatchlistWorkflowResponse = z.infer<
  typeof WatchlistWorkflowResponseSchema
>
export type Error = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
