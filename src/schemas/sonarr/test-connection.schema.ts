import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const TestConnectionBodySchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .pipe(z.url({ error: 'Invalid URL format' }))
    .transform((s) => s.replace(/\/+$/, '')),
  apiKey: z.string().trim().min(1, { error: 'API key is required' }),
})

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type TestConnectionBody = z.input<typeof TestConnectionBodySchema>
export type TestConnectionResponse = z.infer<
  typeof TestConnectionResponseSchema
>
export type TestConnectionError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
