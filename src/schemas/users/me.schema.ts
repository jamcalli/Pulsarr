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

export const MeErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type MeResponse = z.infer<typeof MeResponseSchema>
export type MeError = z.infer<typeof MeErrorSchema>
