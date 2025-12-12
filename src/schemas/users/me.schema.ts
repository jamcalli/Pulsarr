import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const MeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string(),
    role: z.string(),
    avatar: z.string().nullable(),
    plexConnected: z.boolean(),
  }),
})

export type MeResponse = z.infer<typeof MeResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as MeErrorSchema }
export type MeError = z.infer<typeof ErrorSchema>
