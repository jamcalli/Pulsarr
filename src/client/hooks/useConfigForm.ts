import type { StandardSchemaV1 } from '@tanstack/react-form'
import { getConfigSnapshot, updateConfig } from '@/hooks/useConfig'
import { useSaveForm } from '@/hooks/useSaveForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

interface ConfigFormOptions<Values> {
  config: Config
  toValues: (config: Config) => Values
  schema: StandardSchemaV1<Values>
  saveErrorFallback?: string
}

interface ConfigPayloadOption<Values> {
  /** Maps form values that are not a config slice, such as client-only toggles, to the saved payload. */
  toPayload: (values: Values) => ConfigUpdate
}

type ConfigForm<Values> = ReturnType<typeof useSaveForm<Config, Values>>

export function useConfigForm<Values extends ConfigUpdate>(
  options: ConfigFormOptions<Values>,
): ConfigForm<Values>
export function useConfigForm<Values>(
  options: ConfigFormOptions<Values> & ConfigPayloadOption<Values>,
): ConfigForm<Values>
export function useConfigForm<Values extends ConfigUpdate>({
  config,
  toValues,
  schema,
  toPayload = (values) => values,
  saveErrorFallback = 'Settings were not saved. Try again.',
}: ConfigFormOptions<Values> &
  Partial<ConfigPayloadOption<Values>>): ConfigForm<Values> {
  return useSaveForm({
    source: config,
    toValues,
    save: (values) => updateConfig(toPayload(values)),
    latest: getConfigSnapshot,
    schema,
    saveErrorFallback,
  })
}
