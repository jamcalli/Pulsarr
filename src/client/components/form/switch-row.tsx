import { FieldRow } from '@/components/form/field-row'
import { Switch } from '@/components/ui/switch'

interface SwitchRowProps {
  id: string
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  onBlur?: () => void
}

/** A labelled switch that stays beside its label at every width. */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
  onBlur,
}: SwitchRowProps) {
  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      htmlFor={id}
      orientation="horizontal"
    >
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onBlur={onBlur}
        onCheckedChange={(next) => onCheckedChange(next)}
      />
    </FieldRow>
  )
}
