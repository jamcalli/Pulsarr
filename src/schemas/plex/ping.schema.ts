import { z } from 'zod'

export const PingSuccessSchema = z.object({
  success: z.boolean(),
})

export const PingErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
})

export type PingSuccess = z.infer<typeof PingSuccessSchema>
export type PingError = z.infer<typeof PingErrorSchema>