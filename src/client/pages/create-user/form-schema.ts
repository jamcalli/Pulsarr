import * as z from 'zod'

const passwordPattern =
  /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).*$/

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(
    passwordPattern,
    'Password must include uppercase, lowercase, number and special character',
  )

export const EmailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .refine((email) => email.includes('@'), {
    message: 'Please include an @ symbol in the email address',
  })
  .refine((email) => email.includes('.'), {
    message: 'Please include a domain in the email address',
  })

export const createUserFormSchema = z
  .object({
    email: EmailSchema,
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(255, 'Username must be less than 255 characters'),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

export type CreateUserFormSchema = z.infer<typeof createUserFormSchema>
