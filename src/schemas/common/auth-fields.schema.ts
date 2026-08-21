import { z } from 'zod'

export const EmailSchema = z.email({
  error: 'Please enter a valid email address',
})

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, { error: 'Username must be at least 3 characters' })
  .max(255, { error: 'Username must be less than 255 characters' })

export const PasswordSchema = z
  .string()
  .min(8, { error: 'Password must be at least 8 characters' })

// Shared pieces for forms that confirm a password field. Zod cannot express
// the full construction generically, so schemas extend and refine themselves.
export const ConfirmPasswordShape = {
  confirmPassword: z.string(),
}

export const PasswordMatchRefineParams = {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}
