import type { StandardSchemaV1 } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import { useFormDirty } from '@/hooks/useFormDirty'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useTransientFlag } from '@/hooks/useTransientFlag'
import { SAVE_FEEDBACK_DELAY } from '@/lib/constants'
import { liveValidation, useAppForm } from '@/lib/form'
import { mutationErrorMessage } from '@/lib/tanstackApi'

interface SaveFormOptions<Source, Values> {
  source: Source
  toValues: (source: Source) => Values
  save: (values: Values) => Promise<unknown>
  /** The fresh saved value to reset to after a save, or null to fall back to `source`. */
  latest: () => Source | null
  schema?: StandardSchemaV1<Values>
  saveErrorFallback: string
  /** Runs after a successful save, once the form holds the saved values. */
  onSaved?: () => void
}

export function useSaveForm<Source, Values>({
  source,
  toValues,
  save,
  latest,
  schema,
  saveErrorFallback,
  onSaved,
}: SaveFormOptions<Source, Values>) {
  const mutation = useMinLoadingMutation(
    useMutation({
      mutationFn: (values: Values) => withMinDuration(save(values)),
    }),
  )

  const savedThisSubmit = useRef(false)

  const form = useAppForm({
    defaultValues: toValues(source),
    validationLogic: liveValidation,
    validators: { onDynamic: schema },
    // The save bar shows the error from the mutation, so this catch only ends the submit.
    onSubmit: ({ value }) =>
      mutation
        .mutateAsync(value)
        .then(() => {
          savedThisSubmit.current = true
          form.reset(toValues(latest() ?? source))
          onSaved?.()
        })
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
    /** Resolves true only when this call saved, so a clean form, a blocked validation or a failed save all resolve false. */
    submit: async () => {
      if (!dirty) return false
      savedThisSubmit.current = false
      await form.handleSubmit()
      return savedThisSubmit.current
    },
  }
}
