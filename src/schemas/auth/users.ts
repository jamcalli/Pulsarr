import { z } from 'zod'

const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')

export const UpdateCredentialsSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
})

export type UpdateCredentials = z.infer<typeof UpdateCredentialsSchema>
