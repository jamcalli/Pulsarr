import { z } from 'zod'

export interface AdminUser {
  id: number
  username: string
  email: string
  password: string
  role: string
}

export const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(255),
})

export type Credentials = z.infer<typeof CredentialsSchema>

export const AuthSchema = CredentialsSchema.omit({ password: true }).extend({
  id: z.number(),
  username: z.string().min(1).max(255),
  role: z.string(),
})

export type Auth = z.infer<typeof AuthSchema>
