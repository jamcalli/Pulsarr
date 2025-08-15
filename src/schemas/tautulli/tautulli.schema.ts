import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Test connection schemas
export const TestConnectionBodySchema = z.object({
  tautulliUrl: z.string().url({ error: 'Invalid URL format' }),
  tautulliApiKey: z.string().min(1, { error: 'API key is required' }),
})

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Sync notifiers schemas
export const SyncNotifiersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  eligibleUsers: z.number(),
})

// Re-export shared schemas
export { ErrorSchema }

// Type exports
export type TestConnectionBody = z.infer<typeof TestConnectionBodySchema>
export type TestConnectionResponse = z.infer<
  typeof TestConnectionResponseSchema
>
export type SyncNotifiersResponse = z.infer<typeof SyncNotifiersResponseSchema>
