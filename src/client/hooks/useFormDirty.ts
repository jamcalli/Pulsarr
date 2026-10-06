import { type AnyFormApi, useStore } from '@tanstack/react-form'

export function useFormDirty(form: AnyFormApi): boolean {
  return useStore(form.store, (state) => !state.isDefaultValue)
}
