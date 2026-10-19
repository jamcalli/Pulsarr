import {
  type AccountProfile,
  accountFormSchema,
} from '@/features/account/lib/account-form.schema'
import { saveAccount } from '@/features/account/lib/account-save'
import { useSaveForm } from '@/hooks/useSaveForm'
import { currentUserKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import type { paths } from '@/types/api.js'

type CurrentUserResponse =
  paths['/v1/users/me']['get']['responses'][200]['content']['application/json']

function toFormValues(user: AccountProfile) {
  return {
    email: user.email,
    username: user.username,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  }
}

export function useAccountForm(user: AccountProfile) {
  return useSaveForm({
    source: user,
    toValues: toFormValues,
    save: (values) => saveAccount(values, user),
    latest: () =>
      queryClient.getQueryData<CurrentUserResponse>(currentUserKeys.me)?.user ??
      null,
    schema: accountFormSchema(user),
    saveErrorFallback: 'Your account was not updated. Try again.',
  })
}
