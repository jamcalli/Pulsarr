import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const CreateAdminResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export { ErrorSchema as CreateAdminErrorSchema }

export const CreateAdminSchema = z.object({
  email: z
    .email({ error: 'Please enter a valid email address' })
    .refine((email) => email.includes('@'), {
      message: 'Please include an @ symbol in the email address',
    })
    .refine((email) => email.includes('.'), {
      message: 'Please include a domain in the email address',
    }),
  username: z
    .string()
    .min(3, { error: 'Username must be at least 3 characters' })
    .max(255, { error: 'Username must be less than 255 characters' }),
  password: z
    .string()
    .min(8, { error: 'Password must be at least 8 characters' }),
})

// For forms that need password confirmation
export const CreateAdminFormSchema = CreateAdminSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

export type CreateAdminResponse = z.infer<typeof CreateAdminResponseSchema>
export type CreateAdminError = z.infer<typeof ErrorSchema>
export type CreateAdmin = z.infer<typeof CreateAdminSchema>
export type CreateAdminFormSchema = z.infer<typeof CreateAdminFormSchema>
