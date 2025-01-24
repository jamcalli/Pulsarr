import { z } from 'zod'

export const LoginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional()
})

export const LoginErrorSchema = z.object({
  message: z.string()
})

const passwordPattern = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).*$/

export const PasswordSchema = z.string()
  .min(8)
  .regex(passwordPattern)

export const CredentialsSchema = z.object({
  username: z.string().min(1).max(255),
  password: PasswordSchema
})

export type LoginResponse = z.infer<typeof LoginResponseSchema>
export type LoginError = z.infer<typeof LoginErrorSchema>
export type Credentials = z.infer<typeof CredentialsSchema>