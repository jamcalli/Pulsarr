import { useEffect, useState } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { useConfig } from '@/hooks/useConfig'
import { useUserOptions } from '@/hooks/useUserOptions'
import { MIN_LOADING_DELAY } from '@/lib/constants'

interface UserMultiSelectProps {
  field: ControllerRenderProps<any, any>
  disabled?: boolean
}

/**
 * Displays a multi-select input for selecting one or more users, integrating with a controlled form field.
 *
 * Presents users as selectable options and updates the form field value based on the current selection, supporting both single and multiple user selections.
 *
 * @param field - Controlled form field from react-hook-form for managing the selected user(s).
 * @param disabled - If true, disables the multi-select input.
 */
export function UserMultiSelect({ field, disabled }: UserMultiSelectProps) {
  const { isInitialized } = useConfig()
  const { initialize } = useConfig()
  const [isLoading, setIsLoading] = useState(false)
  const {
    options,
    isLoading: usersLoading,
    isError: usersError,
    refetch,
  } = useUserOptions()

  useEffect(() => {
    const initializeStore = async () => {
      try {
        setIsLoading(true)

        // Create minimum loading time promise for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Run initialization in parallel with minimum loading time; the
        // user options query fetches on its own
        const operations = []
        if (!isInitialized) {
          operations.push(initialize())
        }

        await Promise.all([...operations, minimumLoadingTime])
      } finally {
        setIsLoading(false)
      }
    }

    initializeStore()
  }, [initialize, isInitialized])

  if (usersError) {
    return (
      <Button
        type="button"
        variant="neutral"
        className="w-full"
        disabled={disabled}
        onClick={() => refetch()}
      >
        Failed to load users - Retry
      </Button>
    )
  }

  return (
    <MultiSelect
      options={options}
      onValueChange={(values) => {
        field.onChange(values.length === 1 ? values[0] : values)
      }}
      defaultValue={Array.isArray(field.value) ? field.value : field.value ? [field.value] : []}
      placeholder={
        isLoading || usersLoading ? 'Loading users...' : 'Select user(s)'
      }
      modalPopover={true}
      maxCount={2}
      disabled={disabled || isLoading || usersLoading}
    />
  )
}

export default UserMultiSelect
