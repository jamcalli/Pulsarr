import type { ControllerRenderProps } from 'react-hook-form'
import type { SonarrInstance } from '@/context/context'
import type { SonarrInstanceSchema } from '@/components/sonarr/sonarr-instance-card'
import { MultiSelect } from '@/components/multi-select'
import { Computer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

function SyncedInstancesSelect({
  field,
  instances,
  currentInstanceId,
  isDefault,
}: {
  field: ControllerRenderProps<SonarrInstanceSchema, 'syncedInstances'>
  instances: SonarrInstance[]
  currentInstanceId: number
  isDefault: boolean
}) {
  if (!isDefault) {
    return (
      <Badge variant={'warn'} className="h-10 text">
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
    />
  )
}

export default SyncedInstancesSelect
