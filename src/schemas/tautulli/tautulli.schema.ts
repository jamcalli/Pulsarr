import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { HttpUrlSchema } from '@root/schemas/common/url.schema.js'
import { z } from 'zod'

// Test connection schemas
export const TestConnectionBodySchema = z.object({
  tautulliUrl: HttpUrlSchema,
  tautulliApiKey: z.string().trim().min(1, { error: 'API key is required' }),
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
export type TestConnectionBody = z.input<typeof TestConnectionBodySchema>
export type TestConnectionResponse = z.infer<
  typeof TestConnectionResponseSchema
>
export type SyncNotifiersResponse = z.infer<typeof SyncNotifiersResponseSchema>
