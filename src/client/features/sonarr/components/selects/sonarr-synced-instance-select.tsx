import { Computer } from 'lucide-react'
import type { ControllerRenderProps } from 'react-hook-form'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import type { SonarrInstance } from '@/features/sonarr/store/sonarrStore'

/**
 * Displays a multi-select input for selecting Sonarr instances to sync with, excluding the current instance and those with placeholder API keys.
 *
 * Shows a warning badge if syncing is unavailable because the current instance is not the default or if there are no other valid instances to sync with.
 *
 * @param field - Controller render props for managing the `syncedInstances` form field.
 * @param instances - List of available Sonarr instances.
 * @param currentInstanceId - ID of the current Sonarr instance.
 * @param isDefault - Indicates if the current instance is the default.
 * @param disabled - Optional; disables the multi-select input when set to true.
 * @returns A multi-select UI for choosing instances to sync with, or a warning badge if syncing is unavailable.
 */
function SyncedInstancesSelect({
  field,
  instances,
  currentInstanceId,
  isDefault,
  disabled = false,
}: {
  field: ControllerRenderProps<SonarrInstanceSchema, 'syncedInstances'>
  instances: SonarrInstance[]
  currentInstanceId: number
  isDefault: boolean
  disabled?: boolean
}) {
  if (!isDefault) {
    return (
      <Badge variant={'warn'} className="h-10 text w-full flex items-center">
        Syncing is only available for the default instance
      </Badge>
    )
  }

  const availableInstances = instances
    .filter(
      (inst) =>
        inst.id !== currentInstanceId && inst.apiKey !== API_KEY_PLACEHOLDER,
    )
    .map((instance) => ({
      value: instance.id.toString(),
      label: instance.name,
      icon: Computer,
    }))

  if (availableInstances.length < 1) {
    return (
      <Badge variant={'warn'} className="h-10 text w-full flex items-center">
        Syncing requires multiple instances
      </Badge>
    )
  }

  return (
    <MultiSelect
      options={availableInstances}
      onValueChange={(values) => {
        field.onChange(
          values
            .map((v) => Number.parseInt(v, 10))
            .filter((n) => Number.isInteger(n)),
        )
      }}
      value={field.value?.map((id) => id.toString()) || []}
      placeholder="Select instances to sync with"
      variant="default"
      maxCount={1}
      disabled={disabled}
    />
  )
}

export default SyncedInstancesSelect
