import { FieldRow } from '@/components/form/field-row'
import { Switch } from '@/components/ui/switch'
import { useFieldContext } from '@/lib/form-context'

interface SwitchFieldProps {
  label: string
  description?: string
  disabled?: boolean
}

export function SwitchField({
  label,
  description,
  disabled,
}: SwitchFieldProps) {
  const field = useFieldContext<boolean>()

  return (
    <FieldRow
      label={label}
      description={description}
      disabled={disabled}
      htmlFor={field.name}
    >
      <Switch
        id={field.name}
        checked={field.state.value}
        disabled={disabled}
        onBlur={field.handleBlur}
        onCheckedChange={(checked) => field.handleChange(checked)}
      />
    </FieldRow>
  )
}
