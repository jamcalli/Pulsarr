import {
  settingsUpdate,
  toSettingsValues,
  type UserSettingsValues,
} from '@/features/users/lib/user/user-settings-form'
import { UserSettingsFormSchema } from '@/features/users/lib/user/user-settings-form.schema'
import { invalidateUser } from '@/features/users/lib/users-queries'
import { useSaveForm } from '@/hooks/useSaveForm'
import { usersKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { apiFetch, requireSuccess } from '@/lib/tanstackApi'
import type { components, paths } from '@/types/api.js'

type User = components['schemas']['UserWithFriendStatus']
type UserResponse =
  paths['/v1/users/{id}']['get']['responses'][200]['content']['application/json']

export function useUserSettingsForm(user: User) {
  return useSaveForm({
    source: user,
    toValues: toSettingsValues,
    save: async (values: UserSettingsValues) => {
      const { data, error } = await apiFetch.PATCH('/v1/users/{id}', {
        params: { path: { id: user.id } },
        body: settingsUpdate(values, user),
      })
      if (error) throw error
      queryClient.setQueryData(usersKeys.detail(user.id), requireSuccess(data))
      await invalidateUser(user.id)
    },
    latest: () =>
      queryClient.getQueryData<UserResponse>(usersKeys.detail(user.id))?.user ??
      null,
    schema: UserSettingsFormSchema,
    saveErrorFallback: 'The settings were not saved. Save again to retry.',
  })
}

export type UserSettingsForm = ReturnType<typeof useUserSettingsForm>['form']
