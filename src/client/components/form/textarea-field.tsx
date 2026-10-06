import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { FieldError } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useFieldContext } from '@/lib/form-context'

type TextareaFieldProps = {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
} & Pick<
  ComponentProps<typeof Textarea>,
  'autoFocus' | 'placeholder' | 'required' | 'rows' | 'maxLength'
>

export function TextareaField({
  label,
  description,
  disabled,
  orientation = 'responsive',
  ...textareaProps
}: TextareaFieldProps) {
  const field = useFieldContext<string>()
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
        <Textarea
          {...textareaProps}
          id={field.name}
          name={field.name}
          value={field.state.value}
          disabled={disabled}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          aria-invalid={isInvalid}
          aria-describedby={isInvalid ? errorId : undefined}
        />
        <FieldError id={errorId} errors={field.state.meta.errors} />
      </div>
    </FieldRow>
  )
}
