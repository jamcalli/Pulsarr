import type {
  AccountFormValues,
  AccountProfile,
  CurrentUserResponse,
} from '@/features/account/lib/account-form.schema'
import { currentUserKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { apiFetch } from '@/lib/tanstackApi'

// The update endpoints answer with a message only, so the submitted value is written to the cache before the refetch
function storeProfile(saved: Partial<AccountProfile>) {
  queryClient.setQueryData<CurrentUserResponse>(currentUserKeys.me, (prev) =>
    prev ? { ...prev, user: { ...prev.user, ...saved } } : prev,
  )
  return queryClient.invalidateQueries({ queryKey: currentUserKeys.me })
}

/** Saves each changed part in turn and stores it before the next, so a failure leaves the earlier parts saved. */
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
    await storeProfile({ email: values.email })
  }

  if (values.username !== current.username) {
    const { error } = await apiFetch.PUT('/v1/users/update-username', {
      body: { currentPassword, newUsername: values.username },
    })
    if (error) throw error
    await storeProfile({ username: values.username })
  }

  if (values.newPassword !== '') {
    const { error } = await apiFetch.PUT('/v1/users/update-password', {
      body: { currentPassword, newPassword: values.newPassword },
    })
    if (error) throw error
  }
}
