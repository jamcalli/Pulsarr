import { z } from 'zod'
export const ErrorSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  error: z.string(),
  message: z.string().min(1),
})

export type ErrorResponse = z.infer<typeof ErrorSchema>
