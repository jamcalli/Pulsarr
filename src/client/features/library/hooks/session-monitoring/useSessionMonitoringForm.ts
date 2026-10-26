import { savedSessionMonitoring } from '@/features/library/lib/session-monitoring/saved-settings'
import { SessionMonitoringFormSchema } from '@/features/library/lib/session-monitoring/session-monitoring-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toFormValues(config: Config) {
  return { plexSessionMonitoring: savedSessionMonitoring(config) }
}

export function useSessionMonitoringForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toFormValues,
    schema: SessionMonitoringFormSchema,
  })
}
