import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { useConfigStore } from '@/stores/configStore'

interface UserMultiSelectProps {
  field: ControllerRenderProps<any, 'users'>
}

const UserMultiSelect = ({ field }: UserMultiSelectProps) => {
  const users = useConfigStore((state) => state.users)

  const options = users?.map(user => ({
    label: user.name,
    value: user.name,
  })) || []

  return (
    <MultiSelect
      options={options}
      onValueChange={(values) => {
        field.onChange(values.length === 1 ? values[0] : values)
      }}
      defaultValue={Array.isArray(field.value) ? field.value : field.value ? [field.value] : []}
      placeholder="Select user(s)"
      modalPopover={true}
      maxCount={2}
    />
  )
}

export default UserMultiSelect
