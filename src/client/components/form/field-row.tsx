import type { ReactNode } from 'react'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'

interface FieldRowProps {
  label: string
  description?: string
  disabled?: boolean
  orientation?: 'responsive' | 'vertical'
  /** Renders a FieldLabel for this control id, or a FieldTitle when omitted. */
  htmlFor?: string
  labelId?: string
  invalid?: boolean
  /** Keeps the label for assistive tech only and drops the description, for controls in a dense row. */
  labelHidden?: boolean
  children: ReactNode
}

export function FieldRow({
  label,
  description,
  disabled,
  orientation = 'responsive',
  htmlFor,
  labelId,
  invalid,
  labelHidden = false,
  children,
}: FieldRowProps) {
  if (labelHidden) {
    return (
      <Field
        orientation="vertical"
        data-invalid={invalid}
        data-disabled={disabled}
      >
        {htmlFor ? (
          <FieldLabel htmlFor={htmlFor} className="sr-only">
            {label}
          </FieldLabel>
        ) : (
          <FieldTitle id={labelId} className="sr-only">
            {label}
          </FieldTitle>
        )}
        {children}
      </Field>
    )
  }
  return (
    <Field
      orientation={orientation}
      data-invalid={invalid}
      data-disabled={disabled}
    >
      <FieldContent>
        {htmlFor ? (
          <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        ) : (
          <FieldTitle id={labelId}>{label}</FieldTitle>
        )}
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      {children}
    </Field>
  )
}
