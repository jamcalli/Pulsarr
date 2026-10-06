import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Required when the label is an icon. */
  ariaLabel?: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onValueChange: (next: T) => void
  disabled?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  disabled,
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      {...aria}
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      disabled={disabled}
      onValueChange={(groupValue) => {
        const next = options.find((option) => option.value === groupValue[0])
        if (next && next.value !== value) onValueChange(next.value)
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
