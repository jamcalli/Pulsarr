import { z } from 'zod'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'

export const LoginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  username: z.string(),
  redirectTo: z.string().optional(),
})

export { ErrorSchema as LoginErrorSchema }

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')

export const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: PasswordSchema,
})

export type LoginResponse = z.infer<typeof LoginResponseSchema>
export type LoginError = z.infer<typeof ErrorSchema>
export type Credentials = z.infer<typeof CredentialsSchema>
