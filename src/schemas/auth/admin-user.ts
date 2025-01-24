import { z } from 'zod'

export const CreateAdminResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const CreateAdminErrorSchema = z.object({
  message: z.string(),
})

export const CreateAdminSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(255),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).*$/),
})

export type CreateAdminResponse = z.infer<typeof CreateAdminResponseSchema>
export type CreateAdminError = z.infer<typeof CreateAdminErrorSchema>
export type CreateAdmin = z.infer<typeof CreateAdminSchema>
