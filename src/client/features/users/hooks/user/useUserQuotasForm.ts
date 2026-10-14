import { useStore } from '@tanstack/react-form'
import { blankQuotaField } from '@/features/users/lib/quota-fields'
import {
  quotaSave,
  toQuotaValues,
  type UserQuotasValues,
} from '@/features/users/lib/user/user-quotas-form'
import { invalidateUserQuotas } from '@/features/users/lib/users-queries'
import { useSaveForm } from '@/hooks/useSaveForm'
import { userQuotaKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { apiFetch, requireSuccess } from '@/lib/tanstackApi'
import type { components, paths } from '@/types/api.js'

type UserQuotas = components['schemas']['UserQuotas']
type UserQuotasResponse =
  paths['/v1/quota/users/{userId}']['get']['responses'][200]['content']['application/json']

export function useUserQuotasForm(userId: number, quotas: UserQuotas) {
  const saveForm = useSaveForm({
    source: quotas,
    toValues: toQuotaValues,
    save: async (values: UserQuotasValues) => {
      const { data, error } = await apiFetch.PATCH(
        '/v1/quota/users/{userId}/separate',
        { params: { path: { userId } }, body: quotaSave(values) },
      )
      if (error) throw error
      requireSuccess(data)
      await invalidateUserQuotas(userId)
    },
    latest: () =>
      queryClient.getQueryData<UserQuotasResponse>(userQuotaKeys.quotas(userId))
        ?.userQuotas ?? null,
    saveErrorFallback: 'The quotas were not saved. Save again to retry.',
  })
  const blankField = useStore(saveForm.form.store, (state) =>
    blankQuotaField([state.values.movie, state.values.show]),
  )

  return { ...saveForm, blankField }
}

export type UserQuotasForm = ReturnType<typeof useUserQuotasForm>['form']
