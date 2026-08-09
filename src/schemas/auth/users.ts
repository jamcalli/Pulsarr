import {
  EmailSchema,
  PasswordSchema,
  UsernameSchema,
} from '@root/schemas/common/auth-fields.schema.js'
import { z } from 'zod'

export const UpdateCredentialsSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
})

export const UpdateEmailSchema = z.object({
  currentPassword: PasswordSchema,
  newEmail: EmailSchema,
})

export const UpdateUsernameSchema = z.object({
  currentPassword: PasswordSchema,
  newUsername: UsernameSchema,
})

export type UpdateCredentials = z.infer<typeof UpdateCredentialsSchema>
export type UpdateEmail = z.infer<typeof UpdateEmailSchema>
export type UpdateUsername = z.infer<typeof UpdateUsernameSchema>
