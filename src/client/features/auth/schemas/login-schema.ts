import * as z from 'zod'

const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .refine((email) => email.includes('@'), {
      message: 'Please include an @ symbol in the email address',
    })
    .refine((email) => email.includes('.'), {
      message: 'Please include a domain in the email address',
    }),
  password: PasswordSchema,
})

export type LoginFormSchema = z.infer<typeof loginFormSchema>
