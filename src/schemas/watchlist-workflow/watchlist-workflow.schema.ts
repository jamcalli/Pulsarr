import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

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
export type WatchlistWorkflowError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
