import { useScheduledConfigForm } from '@/features/requests/hooks/useScheduledConfigForm'
import { QuotaSettingsFormSchema } from '@/features/requests/lib/quota-settings-form.schema'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toConfigValues(config: Config) {
  return {
    quotaSettings: config.quotaSettings,
    watchlistCapNotify: config.watchlistCapNotify,
    watchlistCapNotifyUser: config.watchlistCapNotifyUser,
  }
}

export function useQuotaSettingsForm(config: Config, schedule: ScheduleStatus) {
  return useScheduledConfigForm({
    config,
    schedule,
    toValues: toConfigValues,
    schema: QuotaSettingsFormSchema,
  })
}
