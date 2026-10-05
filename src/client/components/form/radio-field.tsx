import { FieldRow } from '@/components/form/field-row'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useFieldContext } from '@/lib/form-context'

interface RadioFieldProps<T extends string> {
  label: string
  description?: string
  disabled?: boolean
  options: Array<{ value: T; label: string; description?: string }>
}

export function RadioField<T extends string>({
  label,
  description,
  disabled,
  options,
}: RadioFieldProps<T>) {
  const field = useFieldContext<T>()
  const labelId = `${field.name}-label`

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      orientation="vertical"
      labelId={labelId}
    >
      <RadioGroup
        aria-labelledby={labelId}
        value={field.state.value}
        disabled={disabled}
        onValueChange={(value) => {
          const next = options.find((option) => option.value === value)
          if (next) field.handleChange(next.value)
        }}
      >
        {options.map((option) => {
          const id = `${field.name}-${option.value}`
          return (
            <FieldLabel key={option.value} htmlFor={id}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>{option.label}</FieldTitle>
                  {option.description && (
                    <FieldDescription>{option.description}</FieldDescription>
                  )}
                </FieldContent>
                <RadioGroupItem id={id} value={option.value} />
              </Field>
            </FieldLabel>
          )
        })}
      </RadioGroup>
    </FieldRow>
  )
}
