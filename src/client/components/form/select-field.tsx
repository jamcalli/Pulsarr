import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { FieldError } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFieldContext } from '@/lib/form-context'

interface SelectFieldProps<T extends string> {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>
}

export function SelectField<T extends string>({
  label,
  description,
  disabled,
  orientation = 'responsive',
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
      htmlFor={field.name}
      invalid={isInvalid}
    >
      <div
        className={cn(
          'flex flex-col gap-2',
          orientation === 'responsive' && '@md/field-group:basis-72',
        )}
      >
        <Select
          items={options}
          value={field.state.value}
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
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={errorId} errors={field.state.meta.errors} />
      </div>
    </FieldRow>
  )
}
