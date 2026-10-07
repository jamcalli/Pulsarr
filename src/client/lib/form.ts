import { createFormHook, revalidateLogic } from '@tanstack/react-form'
import { Form } from '@/components/form/form'
import { NumberField } from '@/components/form/number-field'
import { RadioField } from '@/components/form/radio-field'
import { SegmentedField } from '@/components/form/segmented-field'
import { SelectField } from '@/components/form/select-field'
import { SwitchField } from '@/components/form/switch-field'
import { TagsField } from '@/components/form/tags-field'
import { TextField } from '@/components/form/text-field'
import { TextareaField } from '@/components/form/textarea-field'
import { fieldContext, formContext } from '@/lib/form-context'

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextareaField,
    SwitchField,
    RadioField,
    SegmentedField,
    SelectField,
    NumberField,
    TagsField,
  },
  formComponents: { Form },
})

export const submitThenBlurValidation = revalidateLogic({
  mode: 'submit',
  modeAfterSubmission: 'blur',
})
