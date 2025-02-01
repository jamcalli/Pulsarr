import { z } from 'zod'

export const TestConnectionQuerySchema = z.object({
  baseUrl: z.string().url('Invalid URL format'),
  apiKey: z.string().min(1, 'API key is required'),
})

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const ErrorSchema = z.object({
  message: z.string(),
})

export type TestConnectionQuery = z.infer<typeof TestConnectionQuerySchema>
export type TestConnectionResponse = z.infer<typeof TestConnectionResponseSchema>