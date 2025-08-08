import { z } from 'zod'
import { ErrorSchema } from '@schemas/common/error.schema.js'

export const CreateAdminResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export { ErrorSchema as CreateAdminErrorSchema }

export const CreateAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z.string().min(3).max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export type CreateAdminResponse = z.infer<typeof CreateAdminResponseSchema>
export type CreateAdminError = z.infer<typeof ErrorSchema>
export type CreateAdmin = z.infer<typeof CreateAdminSchema>
