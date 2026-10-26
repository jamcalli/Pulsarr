import { useId } from 'react'
import { FilterSelect } from '@/components/filter-select'
import { Field, FieldLabel } from '@/components/ui/field'

interface FilterFieldProps<T extends string | number> {
  label: string
  value: T | null
  options: ReadonlyArray<{ value: T; label: string }>
  onValueChange: (next: T | null) => void
}

/** A labelled full-width filter select, for the phone filter drawer. */
export function FilterField<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
}: FilterFieldProps<T>) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FilterSelect
        id={id}
        label={label}
        value={value}
        options={options}
        onValueChange={onValueChange}
        className="w-full"
      />
    </Field>
  )
}
