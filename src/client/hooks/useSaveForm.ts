import type { StandardSchemaV1 } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { useFormDirty } from '@/hooks/useFormDirty'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useTransientFlag } from '@/hooks/useTransientFlag'
import { SAVE_FEEDBACK_DELAY } from '@/lib/constants'
import { submitThenBlurValidation, useAppForm } from '@/lib/form'
import { mutationErrorMessage } from '@/lib/tanstackApi'

interface SaveFormOptions<Source, Values> {
  source: Source
  toValues: (source: Source) => Values
  save: (values: Values) => Promise<unknown>
  /** The fresh saved value to reset to after a save, or null to fall back to `source`. */
  latest: () => Source | null
  schema?: StandardSchemaV1<Values>
  saveErrorFallback: string
}

export function useSaveForm<Source, Values>({
  source,
  toValues,
  save,
  latest,
  schema,
  saveErrorFallback,
}: SaveFormOptions<Source, Values>) {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (values: Values) => withMinDuration(save(values)),
    }),
  )

  const form = useAppForm({
    defaultValues: toValues(source),
    validationLogic: submitThenBlurValidation,
    validators: { onDynamic: schema },
    // The save bar shows the error from the mutation, so this catch only ends the submit.
    onSubmit: ({ value }) =>
      mutation
        .mutateAsync(value)
        .then(() => form.reset(toValues(latest() ?? source)))
        .catch(() => undefined),
  })

  const dirty = useFormDirty(form)
  const saved = useTransientFlag(
    mutation.isSuccess && !dirty,
    SAVE_FEEDBACK_DELAY,
  )

  const errorMessage =
    mutation.isPending || !mutation.error
      ? null
      : mutationErrorMessage(mutation.error, saveErrorFallback)

  return {
    form,
    dirty,
    saving: mutation.isPending,
    saved,
    errorMessage,
    discard: () => {
      mutation.reset()
      form.reset(toValues(source))
    },
  }
}
