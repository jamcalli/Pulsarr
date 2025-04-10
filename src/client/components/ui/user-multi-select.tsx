import { useEffect } from 'react'
import { MultiSelect } from '@/components/ui/multi-select'
import { useConfigStore } from '@/stores/configStore'
import type { ControllerRenderProps } from 'react-hook-form'

interface UserMultiSelectProps {
  field: ControllerRenderProps<any, any>
}

/**
 * Renders a multi-select input for choosing user(s).
 *
 * This component initializes the configuration store if needed and fetches the user list,
 * mapping each user into an option with a label (combining the user's name with their alias, if available)
 * and a stringified ID as the value. When the selection changes, it updates the form state via the provided
 * field handler, using a single value for one selection and an array for multiple selections.
 *
 * @param field - A controlled form field from react-hook-form used to manage the input's value.
 */
export function UserMultiSelect({ field }: UserMultiSelectProps) {
  const users = useConfigStore((state) => state.users)
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const isInitialized = useConfigStore((state) => state.isInitialized)
  const initialize = useConfigStore((state) => state.initialize)

  useEffect(() => {
    const initializeStore = async () => {
      if (!isInitialized) {
        await initialize()
      }
      await fetchUserData()
    }
    
    initializeStore()
  }, [initialize, isInitialized, fetchUserData])

  const options = users?.map((user) => ({
    label: user.alias 
      ? `${user.name} (${user.alias})`
      : user.name,
    value: user.id.toString(),
  })) ?? []

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
