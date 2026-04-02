import { useMemo } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'

interface StatusOption {
  value: string
  label: string
}

interface StatusMultiSelectProps {
  field: ControllerRenderProps<
    Record<string, unknown>,
    'seriesStatus' | 'movieStatus'
  >
  options: StatusOption[]
  placeholder?: string
}

const StatusMultiSelect = ({
  field,
  options,
  placeholder = 'Select status(es)',
}: StatusMultiSelectProps) => {
  const formattedOptions = useMemo(() => {
    return options.map((opt) => ({
      label: opt.label,
      value: opt.value,
    }))
  }, [options])

  const currentValue = useMemo(() => {
    if (!field.value) return []
    if (Array.isArray(field.value)) return field.value as string[]
    return [field.value as string]
  }, [field.value])

  const handleValueChange = (values: string[]) => {
    const uniqueValues = Array.from(new Set(values))
    field.onChange(uniqueValues)
  }

  return (
    <MultiSelect
      options={formattedOptions}
      onValueChange={handleValueChange}
      value={currentValue}
      placeholder={placeholder}
      modalPopover={true}
      maxCount={2}
    />
  )
}

export default StatusMultiSelect
