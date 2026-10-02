import { createFormHook } from '@tanstack/react-form'
import { TextField } from '@/components/form/text-field'
import { fieldContext, formContext } from '@/lib/form-context'

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: {},
})
