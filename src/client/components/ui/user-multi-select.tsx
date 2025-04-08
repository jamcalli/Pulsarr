import { useEffect } from 'react'
import { MultiSelect } from '@/components/ui/multi-select'
import { useConfigStore } from '@/stores/configStore'
import type { ControllerRenderProps } from 'react-hook-form'

interface UserMultiSelectProps {
  field: ControllerRenderProps<any, any>
}

/**
 * Renders a multi-select input for choosing users.
 *
 * The component integrates with a configuration store to fetch user data and initialize the store if needed.
 * It maps each user to an option where the label displays the user's name and, if available, their alias, and the value is the user's ID.
 * The underlying MultiSelect component is controlled by the provided form field, updating its state by returning a single value
 * when one user is selected or an array when multiple users are selected.
 *
 * @param field - The react-hook-form controller field that manages the user selection state.
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
