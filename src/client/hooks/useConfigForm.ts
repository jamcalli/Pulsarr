import type { StandardSchemaV1 } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { getConfigSnapshot, updateConfig } from '@/hooks/useConfig'
import { useFormDirty } from '@/hooks/useFormDirty'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useTransientFlag } from '@/hooks/useTransientFlag'
import { SAVE_FEEDBACK_DELAY } from '@/lib/constants'
import { submitThenBlurValidation, useAppForm } from '@/lib/form'
import { mutationErrorMessage } from '@/lib/tanstackApi'
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
  const save = useMinLoadingMutation(
    useMutation({
      mutationFn: (values: Values) => withMinDuration(updateConfig(values)),
    }),
  )

  const form = useAppForm({
    defaultValues: toValues(config),
    validationLogic: submitThenBlurValidation,
    validators: { onDynamic: schema },
    // The save bar shows the error from the mutation, so this catch only ends the submit.
    onSubmit: ({ value }) =>
      save
        .mutateAsync(value)
        .then(() => form.reset(toValues(getConfigSnapshot() ?? config)))
        .catch(() => undefined),
  })

  const dirty = useFormDirty(form)
  const saved = useTransientFlag(save.isSuccess && !dirty, SAVE_FEEDBACK_DELAY)

  const errorMessage =
    save.isPending || !save.error
      ? null
      : mutationErrorMessage(save.error, saveErrorFallback)

  return {
    form,
    dirty,
    saving: save.isPending,
    saved,
    errorMessage,
    discard: () => {
      save.reset()
      form.reset(toValues(config))
    },
  }
}
