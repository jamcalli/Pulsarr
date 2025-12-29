import { useEffect, useState } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { useUserOptions } from '@/hooks/useUserOptions'
import { MIN_LOADING_DELAY } from '@/lib/constants'
import { useConfigStore } from '@/stores/configStore'

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
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const isInitialized = useConfigStore((state) => state.isInitialized)
  const initialize = useConfigStore((state) => state.initialize)
  const [isLoading, setIsLoading] = useState(false)
  const { options } = useUserOptions()

  useEffect(() => {
    const initializeStore = async () => {
      try {
        setIsLoading(true)

        // Create minimum loading time promise for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Run initialization and fetch in parallel with minimum loading time
        const operations = []
        if (!isInitialized) {
          operations.push(initialize())
        }
        operations.push(fetchUserData())

        await Promise.all([...operations, minimumLoadingTime])
      } finally {
        setIsLoading(false)
      }
    }

    initializeStore()
  }, [initialize, isInitialized, fetchUserData])

  return (
    <MultiSelect
      options={options}
      onValueChange={(values) => {
        field.onChange(values.length === 1 ? values[0] : values)
      }}
      defaultValue={Array.isArray(field.value) ? field.value : field.value ? [field.value] : []}
      placeholder={isLoading ? 'Loading users...' : 'Select user(s)'}
      modalPopover={true}
      maxCount={2}
      disabled={disabled || isLoading}
    />
  )
}

export default UserMultiSelect
