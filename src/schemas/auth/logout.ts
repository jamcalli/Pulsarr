import { z } from 'zod'

export const LogoutBodySchema = z.object({}).strict()

export const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type LogoutBody = z.infer<typeof LogoutBodySchema>
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>
