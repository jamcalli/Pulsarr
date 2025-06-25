import type { ControllerRenderProps } from 'react-hook-form'
import type { RadarrInstance } from '@/features/radarr/store/radarrStore'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'
import { MultiSelect } from '@/components/ui/multi-select'
import { Computer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'

/**
 * Displays a multi-select UI for choosing Radarr instances to sync with, available only for the default instance.
 *
 * Shows a warning badge if syncing is unavailable because the current instance is not the default or there are no other valid instances to select. Only instances other than the current one and with a non-placeholder API key are selectable.
 *
 * @param field - Form controller props for managing the synced instances field.
 * @param instances - List of all Radarr instances.
 * @param currentInstanceId - ID of the current Radarr instance.
 * @param isDefault - Whether the current instance is the default.
 *
 * @returns The multi-select UI for instance selection, or a warning badge if selection is not possible.
 */
function SyncedInstancesSelect({
  field,
  instances,
  currentInstanceId,
  isDefault,
  disabled = false,
}: {
  field: ControllerRenderProps<RadarrInstanceSchema, 'syncedInstances'>
  instances: RadarrInstance[]
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
      value={field.value?.map((id) => id.toString()) || []}
      placeholder="Select instances to sync with"
      variant="default"
      maxCount={1}
      disabled={disabled}
    />
  )
}

export default SyncedInstancesSelect
