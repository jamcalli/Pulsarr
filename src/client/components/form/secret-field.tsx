import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { SecretInput } from '@/components/form/secret-input'
import { FieldError } from '@/components/ui/field'
import type { InputGroupInput } from '@/components/ui/input-group'
import { useFieldErrors } from '@/hooks/useFieldErrors'
import { useFieldContext } from '@/lib/form-context'

type SecretFieldProps = {
  label: string
  description?: string
  disabled?: boolean
  labelHidden?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  /** Shown with the field's own errors, for a rule the form schema cannot see. */
  error?: string | null
  /** Accessible names for the toggle, which is disabled while the field is empty. */
  revealLabel: { show: string; hide: string }
} & Pick<
  ComponentProps<typeof InputGroupInput>,
  'autoFocus' | 'placeholder' | 'required'
>

export function SecretField({
  label,
  description,
  disabled,
  labelHidden = false,
  orientation = 'responsive',
  error = null,
  revealLabel,
  ...inputProps
}: SecretFieldProps) {
  const field = useFieldContext<string>()
  const fieldErrors = useFieldErrors()
  const errors = error ? [...fieldErrors, { message: error }] : fieldErrors
  const isInvalid = errors.length > 0
  const errorId = `${field.name}-error`

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
            '@lg/field-group:basis-72',
        )}
      >
        <SecretInput
          {...inputProps}
          id={field.name}
          name={field.name}
          autoComplete="off"
          value={field.state.value}
          disabled={disabled}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          aria-invalid={isInvalid}
          aria-describedby={isInvalid ? errorId : undefined}
          revealLabel={revealLabel}
        />
        <FieldError id={errorId} errors={errors} />
      </div>
    </FieldRow>
  )
}
