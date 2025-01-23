import * as z from 'zod'

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .refine((email) => email.includes('@'), {
      message: 'Please include an @ symbol in the email address',
    })
    .refine((email) => email.includes('.'), {
      message: 'Please include a domain in the email address',
    }),
  password: z
    .string()
    .trim()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(
      /[^A-Za-z0-9]/,
      'Password must contain at least one special character',
    ),
})

export type LoginFormSchema = z.infer<typeof loginFormSchema>
