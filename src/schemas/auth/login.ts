import { PasswordSchema } from '@root/schemas/common/auth-fields.schema.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const LoginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  username: z.string(),
  redirectTo: z.string().optional(),
})

export { ErrorSchema as LoginErrorSchema }

export const CredentialsSchema = z.object({
  login: z
    .string()
    .trim()
    .min(1, { error: 'Please enter your email or username' })
    .max(255),
  password: PasswordSchema,
})

export type LoginResponse = z.infer<typeof LoginResponseSchema>
export type LoginError = z.infer<typeof ErrorSchema>
export type Credentials = z.infer<typeof CredentialsSchema>
