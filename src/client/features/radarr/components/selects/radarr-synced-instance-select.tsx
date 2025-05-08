import type { ControllerRenderProps } from 'react-hook-form'
import type { RadarrInstance } from '@/features/radarr/store/radarrStore'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'
import { MultiSelect } from '@/components/ui/multi-select'
import { Computer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * Renders a multi-select UI for choosing Radarr instances to sync with, available only for the default instance.
 *
 * Displays a warning if syncing is not available or if there are no other valid instances to sync with. Filters out the current instance and any with a placeholder API key from the selectable options.
 *
 * @param field - Controller render props for managing the synced instances form field.
 * @param instances - List of all Radarr instances.
 * @param currentInstanceId - The ID of the current Radarr instance.
 * @param isDefault - Whether the current instance is the default.
 *
 * @returns A multi-select component for instance selection, or a warning badge if syncing is unavailable.
 */
function SyncedInstancesSelect({
  field,
  instances,
  currentInstanceId,
  isDefault,
}: {
  field: ControllerRenderProps<RadarrInstanceSchema, 'syncedInstances'>
  instances: RadarrInstance[]
  currentInstanceId: number
  isDefault: boolean
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
      (inst) => inst.id !== currentInstanceId && inst.apiKey !== 'placeholder',
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
      value={field.value?.map((id) => id.toString()) || []}
      placeholder="Select instances to sync with"
      variant="default"
      maxCount={1}
    />
  )
}

export default SyncedInstancesSelect
