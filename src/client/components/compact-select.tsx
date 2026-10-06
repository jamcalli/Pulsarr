import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CompactSelectProps<T extends string | number> {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onValueChange: (next: T) => void
  disabled?: boolean
}

export function CompactSelect<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  disabled,
}: CompactSelectProps<T>) {
  const items = options.map((option) => ({
    value: String(option.value),
    label: option.label,
  }))

  return (
    <Select
      items={items}
      value={String(value)}
      disabled={disabled}
      onValueChange={(next) => {
        const match = options.find((option) => String(option.value) === next)
        if (match) onValueChange(match.value)
      }}
    >
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
