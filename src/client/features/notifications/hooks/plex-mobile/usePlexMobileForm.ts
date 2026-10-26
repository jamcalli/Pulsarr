import { PlexMobileFormSchema } from '@/features/notifications/lib/plex-mobile-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toConfigValues(config: Config) {
  return { plexMobileEnabled: config.plexMobileEnabled }
}

export function usePlexMobileForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toConfigValues,
    schema: PlexMobileFormSchema,
  })
}
