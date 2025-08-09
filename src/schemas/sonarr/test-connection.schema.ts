import { z } from 'zod'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'

export const TestConnectionBodySchema = z.object({
  baseUrl: z.string().url('Invalid URL format'),
  apiKey: z.string().min(1, 'API key is required'),
})

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type TestConnectionBody = z.infer<typeof TestConnectionBodySchema>
export type TestConnectionResponse = z.infer<
  typeof TestConnectionResponseSchema
>
export type TestConnectionError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
