import { useStore } from '@tanstack/react-form'
import { useFieldContext } from '@/lib/form-context'

/** Form-level validation marks every field at once, so a field reports only after its own blur or a submit attempt. */
export function useFieldErrors() {
  const field = useFieldContext()
  const submitted = useStore(
    field.form.store,
    (state) => state.submissionAttempts > 0,
  )
  const { errors, isBlurred } = field.state.meta
  return isBlurred || submitted ? errors : []
}
