import { z } from 'zod'

export const AuthCheckResponseSchema = z.object({
  authenticated: z.literal(true),
})

export type AuthCheckResponse = z.infer<typeof AuthCheckResponseSchema>
