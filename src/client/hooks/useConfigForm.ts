import type { StandardSchemaV1 } from '@tanstack/react-form'
import { getConfigSnapshot, updateConfig } from '@/hooks/useConfig'
import { useSaveForm } from '@/hooks/useSaveForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

interface ConfigFormOptions<Values extends ConfigUpdate> {
  config: Config
  toValues: (config: Config) => Values
  schema: StandardSchemaV1<Values>
  saveErrorFallback?: string
}

export function useConfigForm<Values extends ConfigUpdate>({
  config,
  toValues,
  schema,
  saveErrorFallback = 'Settings were not saved. Try again.',
}: ConfigFormOptions<Values>) {
  return useSaveForm({
    source: config,
    toValues,
    save: updateConfig,
    latest: getConfigSnapshot,
    schema,
    saveErrorFallback,
  })
}
