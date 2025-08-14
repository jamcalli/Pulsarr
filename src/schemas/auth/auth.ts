import { z } from 'zod'

export interface AdminUser {
  id: number
  username: string
  email: string
  password: string
  role: string
}

const PasswordSchema = z
  .string()
  .min(8, { error: 'Password must be at least 8 characters long' })

export const CredentialsSchema = z.object({
  email: z
    .email({ error: 'Please enter a valid email address' })
    .refine((email) => email.includes('@'), {
      message: 'Please include an @ symbol in the email address',
    })
    .refine((email) => email.includes('.'), {
      message: 'Please include a domain in the email address',
    }),
  password: PasswordSchema,
})

// For compatibility with existing API usage
export const loginFormSchema = CredentialsSchema

export type Credentials = z.infer<typeof CredentialsSchema>

export const AuthSchema = CredentialsSchema.omit({ password: true }).extend({
  id: z.number(),
  username: z.string().min(1).max(255),
  role: z.string(),
})

export type Auth = z.infer<typeof AuthSchema>
