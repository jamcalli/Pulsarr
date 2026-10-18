import type { UserPageData } from '@/features/users/hooks/user/useUserPage'
import { useUserQuotasForm } from '@/features/users/hooks/user/useUserQuotasForm'
import { useUserSettingsForm } from '@/features/users/hooks/user/useUserSettingsForm'
import { BLANK_QUOTA_MESSAGES } from '@/features/users/lib/quota-fields'

/** One save bar for the settings and quotas forms, each save resetting only its own fields. */
export function useUserForms(data: UserPageData) {
  const settings = useUserSettingsForm(data.user)
  const quotas = useUserQuotasForm(data.id, data.quotas)
  const dirty = settings.dirty || quotas.dirty
  const blankField = quotas.dirty ? quotas.blankField : null
  const saveBlocked = blankField !== null

  return {
    settingsForm: settings.form,
    quotasForm: quotas.form,
    dirty,
    saving: settings.saving || quotas.saving,
    saved: (settings.saved || quotas.saved) && !dirty,
    saveBlocked,
    blockedMessage:
      blankField === null ? undefined : BLANK_QUOTA_MESSAGES[blankField],
    errorMessage: settings.errorMessage ?? quotas.errorMessage,
    discard: () => {
      settings.discard()
      quotas.discard()
    },
    submit: async () => {
      if (saveBlocked) return
      if (settings.dirty && !(await settings.submit())) return
      if (quotas.dirty) await quotas.submit()
    },
  }
}

export type UserForms = ReturnType<typeof useUserForms>
