import {
  Select,
  SelectContent,
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

/** The first option, labelled like the placeholder, clears the filter. */
export function FilterSelect<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  id,
  className,
}: FilterSelectProps<T>) {
  const items = [
    { value: null, label },
    ...options.map((option) => ({
      value: String(option.value),
      label: option.label,
    })),
  ]

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
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value ?? ''} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
