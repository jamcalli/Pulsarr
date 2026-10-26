import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type SegmentValue = string | boolean | null

export interface SegmentedOption<T extends SegmentValue> {
  value: T
  label: ReactNode
  /** Required when the label is an icon. */
  ariaLabel?: string
}

interface SegmentedControlProps<T extends SegmentValue> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onValueChange: (next: T) => void
  disabled?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function SegmentedControl<T extends SegmentValue>({
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
      value={[String(value)]}
      disabled={disabled}
      onValueChange={(groupValue) => {
        const next = options.find(
          (option) => String(option.value) === groupValue[0],
        )
        if (next && next.value !== value) onValueChange(next.value)
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={String(option.value)}
          value={String(option.value)}
          aria-label={option.ariaLabel}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
