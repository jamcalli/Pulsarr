import {
  ConfirmPasswordShape,
  EmailSchema,
  PasswordMatchRefineParams,
  PasswordSchema,
  UsernameSchema,
} from '@root/schemas/common/auth-fields.schema.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const CreateAdminResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export { ErrorSchema as CreateAdminErrorSchema }

export const CreateAdminSchema = z.object({
  email: EmailSchema,
  username: UsernameSchema,
  password: PasswordSchema,
})

// For forms that need password confirmation
export const CreateAdminFormSchema = CreateAdminSchema.extend(
  ConfirmPasswordShape,
).refine(
  (data) => data.password === data.confirmPassword,
  PasswordMatchRefineParams,
)

export type CreateAdminResponse = z.infer<typeof CreateAdminResponseSchema>
export type CreateAdminError = z.infer<typeof ErrorSchema>
export type CreateAdmin = z.infer<typeof CreateAdminSchema>
export type CreateAdminForm = z.infer<typeof CreateAdminFormSchema>
