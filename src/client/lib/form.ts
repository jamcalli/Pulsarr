import {
  createFormHook,
  defaultValidationLogic,
  type ValidationLogicFn,
  type ValidationLogicProps,
} from '@tanstack/react-form'
import { Form } from '@/components/form/form'
import { NumberField } from '@/components/form/number-field'
import { RadioField } from '@/components/form/radio-field'
import { ScheduleField } from '@/components/form/schedule-field'
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
    ScheduleField,
    TagsField,
  },
  formComponents: { Form },
})

type ValidatorList = Parameters<
  ValidationLogicProps['runValidation']
>[0]['validators']

/** The schema runs on change, blur and submit before the first submit attempt and on change after, so an untouched field reports on blur and a typed one never holds a stale error. */
export const liveValidation: ValidationLogicFn = (props) => {
  const { validators, event, form, group } = props
  if (!validators) return defaultValidationLogic(props)
  const attempts = group
    ? group.state.meta.submissionAttempts
    : form.state.submissionAttempts
  const triggers =
    attempts === 0 ? ['change', 'blur', 'submit'] : ['change', 'submit']
  const dynamic = {
    fn: event.async ? validators.onDynamicAsync : validators.onDynamic,
    cause: 'dynamic' as const,
  }
  let defaults: ValidatorList = []
  defaultValidationLogic({
    ...props,
    runValidation: (run) => {
      defaults = run.validators
    },
  })
  return props.runValidation({
    validators: triggers.includes(event.type)
      ? [...defaults, dynamic]
      : defaults,
    form,
  })
}
