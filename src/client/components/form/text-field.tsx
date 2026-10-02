import type { ComponentProps } from 'react'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useFieldContext } from '@/lib/form-context'

type TextFieldProps = { label: string } & Pick<
  ComponentProps<typeof Input>,
  'type' | 'autoComplete' | 'autoFocus' | 'placeholder'
>

export function TextField({ label, ...inputProps }: TextFieldProps) {
  const field = useFieldContext<string>()
  const isInvalid = field.state.meta.errors.length > 0

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        {...inputProps}
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={isInvalid}
      />
      <FieldError errors={field.state.meta.errors} />
    </Field>
  )
}
