import { MAINTAINERR_EXCLUSION_MODE_DEFAULT } from '@root/schemas/config/config.schema'
import { MaintainerrFormSchema } from '@/features/library/lib/exclusions/maintainerr-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toFormValues(config: Config) {
  return {
    maintainerrEnabled: config.maintainerrEnabled,
    maintainerrUrl: config.maintainerrUrl ?? '',
    maintainerrExclusionMode:
      config.maintainerrExclusionMode ?? MAINTAINERR_EXCLUSION_MODE_DEFAULT,
  }
}

export function useMaintainerrForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toFormValues,
    schema: MaintainerrFormSchema,
  })
}
