import type { ControllerRenderProps } from 'react-hook-form'
import type { RadarrInstance } from '@/features/radarr/store/radarrStore'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'
import { MultiSelect } from '@/components/ui/multi-select'
import { Computer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'

/**
 * Renders a multi-select UI for selecting Radarr instances to sync with, restricted to the default instance.
 *
 * Displays a warning badge if syncing is unavailable due to not being on the default instance or lacking additional valid instances. Only instances other than the current one and with a valid API key are selectable.
 *
 * @param field - Controller props for managing the synced instances form field.
 * @param instances - Array of all Radarr instances.
 * @param currentInstanceId - The ID of the current Radarr instance.
 * @param isDefault - Indicates if the current instance is the default.
 * @param disabled - If true, disables the multi-select UI.
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
