import type { ComponentProps } from 'react'
import { FieldRow } from '@/components/form/field-row'
import { SegmentedControl } from '@/components/segmented-control'
import { useFieldContext } from '@/lib/form-context'

interface SegmentedFieldProps<T extends string | boolean | null> {
  label: string
  description?: string
  disabled?: boolean
  orientation?: ComponentProps<typeof FieldRow>['orientation']
  labelHidden?: boolean
  options: ReadonlyArray<{ value: T; label: string }>
  /** Return false to cancel the change. */
  onBeforeChange?: (next: T) => boolean
}

export function SegmentedField<T extends string | boolean | null>({
  label,
  description,
  disabled,
  orientation,
  labelHidden,
  options,
  onBeforeChange,
}: SegmentedFieldProps<T>) {
  const field = useFieldContext<T>()
  const labelId = `${field.name}-label`

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      orientation={orientation}
      labelHidden={labelHidden}
      labelId={labelId}
    >
      <SegmentedControl
        aria-labelledby={labelId}
        value={field.state.value}
        options={options}
        disabled={disabled}
        onValueChange={(next) => {
          if (onBeforeChange && !onBeforeChange(next)) return
          field.handleChange(next)
        }}
      />
    </FieldRow>
  )
}
