import { SelectList } from '@/components/select-list'
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface FilterSelectProps<T extends string | number> {
  label: string
  value: T | null
  options: ReadonlyArray<{ value: T; label: string }>
  onValueChange: (next: T | null) => void
  id?: string
  className?: string
}

/** The "All" item clears the filter to null, and the trigger then shows the label as its placeholder. */
export function FilterSelect<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  id,
  className,
}: FilterSelectProps<T>) {
  const items = options.map((option) => ({
    value: String(option.value),
    label: option.label,
  }))

  return (
    <Select
      items={items}
      value={value === null ? null : String(value)}
      onValueChange={(next) =>
        onValueChange(
          options.find((option) => String(option.value) === next)?.value ??
            null,
        )
      }
    >
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectList label={label}>
        <SelectItem value={null}>All</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectList>
    </Select>
  )
}
