import { z } from 'zod'

export interface AdminUser {
  id: number
  username: string
  email: string
  password: string
  role: string
}

export const AuthSchema = z.object({
  id: z.number(),
  email: z.string(),
  username: z.string().min(1).max(255),
  role: z.string(),
})

export type Auth = z.infer<typeof AuthSchema>
