import { FieldRow } from '@/components/form/field-row'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useFieldContext } from '@/lib/form-context'

interface SegmentedFieldProps<T extends string> {
  label: string
  description?: string
  disabled?: boolean
  options: Array<{ value: T; label: string }>
  /** Return false to cancel the change. */
  onBeforeChange?: (next: T) => boolean
}

export function SegmentedField<T extends string>({
  label,
  description,
  disabled,
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
      labelId={labelId}
    >
      <ToggleGroup
        aria-labelledby={labelId}
        variant="outline"
        size="sm"
        spacing={0}
        value={[field.state.value]}
        disabled={disabled}
        onValueChange={(groupValue) => {
          const next = options.find((option) => option.value === groupValue[0])
          if (!next || next.value === field.state.value) return
          if (onBeforeChange && !onBeforeChange(next.value)) return
          field.handleChange(next.value)
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldRow>
  )
}
