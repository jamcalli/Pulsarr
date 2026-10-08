import { Toggle } from '@/components/ui/toggle'

interface NotToggleProps {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  /** What the toggle negates, such as "this condition", read after "Not" by assistive tech. */
  target: string
  disabled?: boolean
}

export function NotToggle({
  pressed,
  onPressedChange,
  target,
  disabled,
}: NotToggleProps) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      className="font-bold data-pressed:bg-foreground data-pressed:text-background"
      pressed={pressed}
      onPressedChange={onPressedChange}
      disabled={disabled}
      aria-label={`Not ${target}`}
    >
      Not
    </Toggle>
  )
}
