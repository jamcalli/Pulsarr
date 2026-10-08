import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { OptionLabel } from '@/components/form/option-label'
import { FieldError } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFieldContext } from '@/lib/form-context'

interface SelectFieldProps<T extends string | null> {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  labelHidden?: boolean
  placeholder?: string
  /** A null-valued option is a real choice shown by its label, not the placeholder. */
  options: ReadonlyArray<{
    value: T
    label: string
    description?: string
    disabled?: boolean
  }>
}

export function SelectField<T extends string | null>({
  label,
  description,
  disabled,
  orientation = 'responsive',
  labelHidden = false,
  placeholder,
  options,
}: SelectFieldProps<T>) {
  const field = useFieldContext<T>()
  const isInvalid = field.state.meta.errors.length > 0
  const errorId = `${field.name}-error`

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      orientation={orientation}
      labelHidden={labelHidden}
      htmlFor={field.name}
      invalid={isInvalid}
    >
      <div
        className={cn(
          'flex flex-col gap-2',
          !labelHidden &&
            orientation === 'responsive' &&
            '@md/field-group:basis-72',
        )}
      >
        <Select
          items={options}
          value={field.state.value === '' ? null : field.state.value}
          disabled={disabled}
          onValueChange={(next) => {
            const match = options.find((option) => option.value === next)
            if (match) field.handleChange(match.value)
          }}
        >
          <SelectTrigger
            id={field.name}
            className="w-full"
            onBlur={field.handleBlur}
            aria-invalid={isInvalid}
            aria-describedby={isInvalid ? errorId : undefined}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem
                key={String(option.value)}
                value={option.value}
                disabled={option.disabled}
              >
                <OptionLabel description={option.description}>
                  {option.label}
                </OptionLabel>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={errorId} errors={field.state.meta.errors} />
      </div>
    </FieldRow>
  )
}
