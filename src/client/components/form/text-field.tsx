import { cn } from 'cn'
import type { ComponentProps, ReactNode } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useFieldErrors } from '@/hooks/useFieldErrors'
import { useFieldContext } from '@/lib/form-context'

type TextFieldProps = {
  label: string
  description?: string
  disabled?: boolean
  labelHidden?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  preview?: (value: string) => ReactNode
  /** A control drawn beside the input, such as the form's submit button. */
  action?: ReactNode
  mono?: boolean
} & Pick<
  ComponentProps<typeof Input>,
  'type' | 'autoComplete' | 'autoFocus' | 'placeholder' | 'required'
>

export function TextField({
  label,
  description,
  disabled,
  labelHidden = false,
  orientation = 'responsive',
  preview,
  action,
  mono = false,
  ...inputProps
}: TextFieldProps) {
  const field = useFieldContext<string>()
  const errors = useFieldErrors()
  const isInvalid = errors.length > 0
  const errorId = `${field.name}-error`
  const input = (
    <Input
      {...inputProps}
      id={field.name}
      name={field.name}
      value={field.state.value}
      disabled={disabled}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(event.target.value)}
      aria-invalid={isInvalid}
      aria-describedby={isInvalid ? errorId : undefined}
      className={cn(action && 'min-w-0 flex-1', mono && 'font-mono')}
    />
  )

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      labelHidden={labelHidden}
      orientation={orientation}
      htmlFor={field.name}
      invalid={isInvalid}
    >
      <div
        className={cn(
          'flex flex-col gap-2',
          !labelHidden &&
            orientation === 'responsive' &&
            (action ? '@lg/field-group:basis-96' : '@lg/field-group:basis-72'),
        )}
      >
        {action ? (
          <div className="flex gap-2">
            {input}
            {action}
          </div>
        ) : (
          input
        )}
        {preview && (
          <p className="text-sm text-muted-foreground">
            {preview(field.state.value)}
          </p>
        )}
        <FieldError id={errorId} errors={errors} />
      </div>
    </FieldRow>
  )
}
