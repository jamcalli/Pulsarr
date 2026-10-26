import { PlexLabelsFormSchema } from '@/features/users/lib/plex-labels-form.schema'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { useScheduledConfigForm } from '@/hooks/useScheduledConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toConfigValues(config: Config) {
  return { plexLabelSync: config.plexLabelSync }
}

export function usePlexLabelsForm(config: Config, schedule: ScheduleStatus) {
  return useScheduledConfigForm({
    config,
    schedule,
    toValues: toConfigValues,
    schema: PlexLabelsFormSchema,
  })
}
