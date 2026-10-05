import { createFormHook } from '@tanstack/react-form'
import { Form } from '@/components/form/form'
import { RadioField } from '@/components/form/radio-field'
import { SegmentedField } from '@/components/form/segmented-field'
import { SwitchField } from '@/components/form/switch-field'
import { TextField } from '@/components/form/text-field'
import { fieldContext, formContext } from '@/lib/form-context'

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, SwitchField, RadioField, SegmentedField },
  formComponents: { Form },
})
