import { useEffect } from 'react'
import { MultiSelect } from '@/components/ui/multi-select'
import { useConfigStore } from '@/stores/configStore'
import type { ControllerRenderProps } from 'react-hook-form'

interface UserMultiSelectProps {
  field: ControllerRenderProps<any, any>
  disabled?: boolean
}

/**
 * Displays a multi-select input for selecting one or more users, integrating with a controlled form field.
 *
 * Initializes and fetches user data from the configuration store if necessary, then presents users as selectable options. Updates the form field value based on the current selection, supporting both single and multiple user selections.
 *
 * @param field - Controlled form field from react-hook-form for managing the selected user(s).
 * @param disabled - If true, disables the multi-select input.
 */
export function UserMultiSelect({ field, disabled }: UserMultiSelectProps) {
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
      disabled={disabled}
    />
  )
}

export default UserMultiSelect
