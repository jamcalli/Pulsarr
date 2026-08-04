import type { ControllerRenderProps } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { useUserOptions } from '@/hooks/useUserOptions'

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
  const {
    options,
    isLoading: usersLoading,
    isError: usersError,
    refetch,
  } = useUserOptions()

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
        usersLoading ? 'Loading users...' : 'Select user(s)'
      }
      modalPopover={true}
      maxCount={2}
      disabled={disabled || usersLoading}
    />
  )
}

export default UserMultiSelect
