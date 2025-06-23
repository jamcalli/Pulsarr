import type { ControllerRenderProps } from 'react-hook-form'
import type { SonarrInstance } from '@/features/sonarr/store/sonarrStore'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import { MultiSelect } from '@/components/ui/multi-select'
import { Computer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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
      defaultValue={field.value?.map((id) => id.toString()) || []}
      placeholder="Select instances to sync with"
      variant="default"
      maxCount={1}
      disabled={disabled}
    />
  )
}

export default SyncedInstancesSelect
