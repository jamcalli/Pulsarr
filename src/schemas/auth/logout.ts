import { z } from 'zod'

export const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>