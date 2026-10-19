import {
  EmailSchema,
  PasswordMatchRefineParams,
  PasswordSchema,
  UsernameSchema,
} from '@root/schemas/common/auth-fields.schema'
import { z } from 'zod'
import type { paths } from '@/types/api.js'

export type CurrentUserResponse =
  paths['/v1/users/me']['get']['responses'][200]['content']['application/json']

export type AccountProfile = Pick<
  CurrentUserResponse['user'],
  'email' | 'username'
>

type AccountChanges = Pick<
  AccountFormValues,
  'email' | 'username' | 'newPassword' | 'currentPassword'
>

export function hasAccountChanges(
  values: AccountChanges,
  current: AccountProfile,
): boolean {
  return (
    values.email !== current.email ||
    values.username !== current.username ||
    values.newPassword !== ''
  )
}

/** The field shows this at once, before any blur, so the save bar never sits disabled without a reason on screen. */
export function currentPasswordError(
  values: AccountChanges,
  current: AccountProfile,
): string | null {
  return hasAccountChanges(values, current) && values.currentPassword === ''
    ? 'Enter your current password to save.'
    : null
}

export function accountFormSchema(current: AccountProfile) {
  return z
    .object({
      email: EmailSchema,
      username: UsernameSchema,
      currentPassword: z.string(),
      newPassword: z.string(),
      confirmPassword: z.string(),
    })
    .superRefine((values, ctx) => {
      if (!hasAccountChanges(values, current)) {
        ctx.addIssue({
          code: 'custom',
          path: ['newPassword'],
          message: 'Change your email, username or password first.',
        })
      }

      if (values.newPassword === '') return
      const password = PasswordSchema.safeParse(values.newPassword)
      if (!password.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['newPassword'],
          message: password.error.issues[0]?.message,
        })
      }
      if (values.confirmPassword !== values.newPassword) {
        ctx.addIssue({ code: 'custom', ...PasswordMatchRefineParams })
      }
    })
}

export type AccountFormValues = z.infer<ReturnType<typeof accountFormSchema>>
