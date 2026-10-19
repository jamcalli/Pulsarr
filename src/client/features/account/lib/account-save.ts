import type {
  AccountFormValues,
  AccountProfile,
} from '@/features/account/lib/account-form.schema'
import { currentUserKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { apiFetch } from '@/lib/tanstackApi'

const refreshCurrentUser = () =>
  queryClient.invalidateQueries({ queryKey: currentUserKeys.me })

/** Saves each changed part in turn and refreshes the current user after each, so a failure leaves the earlier parts saved. */
export async function saveAccount(
  values: AccountFormValues,
  current: AccountProfile,
): Promise<void> {
  const { currentPassword } = values

  if (values.email !== current.email) {
    const { error } = await apiFetch.PUT('/v1/users/update-email', {
      body: { currentPassword, newEmail: values.email },
    })
    if (error) throw error
    await refreshCurrentUser()
  }

  if (values.username !== current.username) {
    const { error } = await apiFetch.PUT('/v1/users/update-username', {
      body: { currentPassword, newUsername: values.username },
    })
    if (error) throw error
    await refreshCurrentUser()
  }

  if (values.newPassword !== '') {
    const { error } = await apiFetch.PUT('/v1/users/update-password', {
      body: { currentPassword, newPassword: values.newPassword },
    })
    if (error) throw error
    await refreshCurrentUser()
  }
}
