import { SwitchRow } from '@/components/form/switch-row'
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
    <SwitchRow
      id={field.name}
      label={label}
      description={description}
      checked={field.state.value}
      disabled={disabled}
      onBlur={field.handleBlur}
      onCheckedChange={(checked) => field.handleChange(checked)}
    />
  )
}
