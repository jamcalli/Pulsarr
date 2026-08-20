import {
  ConfirmPasswordShape,
  EmailSchema,
  PasswordMatchRefineParams,
  PasswordSchema,
  UsernameSchema,
} from '@root/schemas/common/auth-fields.schema.js'
import { z } from 'zod'

export const UpdateCredentialsSchema = z
  .object({
    currentPassword: PasswordSchema.meta({
      description: 'Current password for verification',
    }),
    newPassword: PasswordSchema.meta({ description: 'New password to set' }),
  })
  .meta({
    id: 'UpdateCredentialsPayload',
    description: 'Change the current admin password',
  })

export const UpdateEmailSchema = z
  .object({
    currentPassword: PasswordSchema.meta({
      description: 'Current password for verification',
    }),
    newEmail: EmailSchema.meta({ description: 'New email address to set' }),
  })
  .meta({
    id: 'UpdateEmailPayload',
    description: 'Change the current admin email address',
  })

export const UpdateUsernameSchema = z
  .object({
    currentPassword: PasswordSchema.meta({
      description: 'Current password for verification',
    }),
    newUsername: UsernameSchema.meta({ description: 'New username to set' }),
  })
  .meta({
    id: 'UpdateUsernamePayload',
    description: 'Change the current admin username',
  })

// For forms that need password confirmation
export const UpdateCredentialsFormSchema = UpdateCredentialsSchema.extend(
  ConfirmPasswordShape,
).refine(
  (data) => data.newPassword === data.confirmPassword,
  PasswordMatchRefineParams,
)

export type UpdateCredentials = z.infer<typeof UpdateCredentialsSchema>
export type UpdateCredentialsForm = z.infer<typeof UpdateCredentialsFormSchema>
export type UpdateEmail = z.infer<typeof UpdateEmailSchema>
export type UpdateUsername = z.infer<typeof UpdateUsernameSchema>
