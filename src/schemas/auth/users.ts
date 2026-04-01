import { PasswordSchema } from '@root/schemas/common/auth-fields.schema.js'
import { z } from 'zod'

export const UpdateCredentialsSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
})

export type UpdateCredentials = z.infer<typeof UpdateCredentialsSchema>
