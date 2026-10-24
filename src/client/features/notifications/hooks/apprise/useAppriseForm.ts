import { AppriseFormSchema } from '@/features/notifications/lib/apprise-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toConfigValues(config: Config) {
  return {
    appriseEmailSender: config.appriseEmailSender ?? '',
    systemAppriseUrl: config.systemAppriseUrl ?? '',
  }
}

export function useAppriseForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toConfigValues,
    schema: AppriseFormSchema,
  })
}
