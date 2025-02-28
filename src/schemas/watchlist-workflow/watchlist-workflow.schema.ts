import { z } from 'zod'

// Schema for Watchlist workflow status responses
export const WatchlistWorkflowResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(['running', 'stopped', 'starting', 'stopping']),
  message: z.string().optional(),
})

// Common error schema
export const ErrorSchema = z.object({
  message: z.string(),
})

// Type exports
export type WatchlistWorkflowResponse = z.infer<
  typeof WatchlistWorkflowResponseSchema
>
export type Error = z.infer<typeof ErrorSchema>
