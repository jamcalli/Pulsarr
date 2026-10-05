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
  children,
}: FieldRowProps) {
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
