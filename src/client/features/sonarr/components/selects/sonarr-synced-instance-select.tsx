import type { ControllerRenderProps } from 'react-hook-form'
import type { SonarrInstance } from '@/features/sonarr/store/sonarrStore'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import { MultiSelect } from '@/components/ui/multi-select'
import { Computer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

/**
 * Renders a multi-select input for choosing Sonarr instances to sync with, excluding the current instance and those with placeholder API keys.
 *
 * Displays a warning if syncing is unavailable due to the current instance not being the default or if there are no other valid instances to sync with.
 *
 * @param field - Controller render props for managing the `syncedInstances` form field
 * @param instances - List of available Sonarr instances
 * @param currentInstanceId - ID of the current Sonarr instance
 * @param isDefault - Whether the current instance is the default
 * @param disabled - Whether the multi-select input should be disabled
 * @returns A multi-select UI for selecting instances to sync with, or a warning badge if unavailable
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
        field.onChange(values.map((v) => Number.parseInt(v)))
      }}
      defaultValue={field.value?.map((id) => id.toString()) || []}
      placeholder="Select instances to sync with"
      variant="default"
      maxCount={1}
      disabled={disabled}
    />
  )
}

export default SyncedInstancesSelect
