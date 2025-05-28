import { z } from 'zod'

// Test connection schemas
export const TestConnectionBodySchema = z.object({
  tautulliUrl: z.string().url('Invalid URL format'),
  tautulliApiKey: z.string().min(1, 'API key is required'),
})

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Sync notifiers schemas
export const SyncNotifiersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  syncedUsers: z.number(),
})

// Error schema
export const ErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Type exports
export type TestConnectionBody = z.infer<typeof TestConnectionBodySchema>
export type TestConnectionResponse = z.infer<
  typeof TestConnectionResponseSchema
>
export type SyncNotifiersResponse = z.infer<typeof SyncNotifiersResponseSchema>
