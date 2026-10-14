import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { OptionLabel } from '@/components/form/option-label'
import { SelectList } from '@/components/select-list'
import { FieldError } from '@/components/ui/field'
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFieldErrors } from '@/hooks/useFieldErrors'
import { usePopupBlur } from '@/hooks/usePopupBlur'
import { useFieldContext } from '@/lib/form-context'

interface SelectFieldProps<T extends string | null> {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  labelHidden?: boolean
  placeholder?: string
  /** Shown with the field's own errors, for a rule the form schema cannot see. */
  error?: string | null
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
  error = null,
  options,
}: SelectFieldProps<T>) {
  const field = useFieldContext<T>()
  const fieldErrors = useFieldErrors()
  const errors = error ? [...fieldErrors, { message: error }] : fieldErrors
  const popup = usePopupBlur()
  const isInvalid = errors.length > 0
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
            '@lg/field-group:basis-72',
        )}
      >
        <Select
          items={options}
          value={field.state.value === '' ? null : field.state.value}
          disabled={disabled}
          onOpenChange={popup.onOpenChange}
          onValueChange={(next) => {
            const match = options.find((option) => option.value === next)
            if (match) field.handleChange(match.value)
          }}
        >
          <SelectTrigger
            id={field.name}
            className="w-full"
            onBlur={popup.onBlur}
            aria-invalid={isInvalid}
            aria-describedby={isInvalid ? errorId : undefined}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectList label={label}>
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
          </SelectList>
        </Select>
        <FieldError id={errorId} errors={errors} />
      </div>
    </FieldRow>
  )
}
