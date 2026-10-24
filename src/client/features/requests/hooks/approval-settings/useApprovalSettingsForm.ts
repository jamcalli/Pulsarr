import { ApprovalSettingsFormSchema } from '@/features/requests/lib/approval-settings-form.schema'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { useScheduledConfigForm } from '@/hooks/useScheduledConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toConfigValues(config: Config) {
  return {
    approvalNotify: config.approvalNotify,
    approvalExpiration: config.approvalExpiration,
  }
}

export function useApprovalSettingsForm(
  config: Config,
  schedule: ScheduleStatus,
) {
  return useScheduledConfigForm({
    config,
    schedule,
    toValues: toConfigValues,
    schema: ApprovalSettingsFormSchema,
  })
}
