import { z } from 'zod'

const passwordPattern =
  /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).*$/

const PasswordSchema = z.string().min(8).regex(passwordPattern)

export const UpdateCredentialsSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
})

export type UpdateCredentials = z.infer<typeof UpdateCredentialsSchema>
