import type { ControllerRenderProps } from 'react-hook-form'
import { Check } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormControl } from '@/components/ui/form'
import type { SonarrInstance } from '@/context/context'
import type { SonarrInstanceSchema } from './sonarr-instance-card'

function SyncedInstancesSelect({
  field,
  instances,
  currentInstanceId,
}: {
  field: ControllerRenderProps<SonarrInstanceSchema, 'syncedInstances'>
  instances: SonarrInstance[]
  currentInstanceId: number
}) {
  const availableInstances = instances.filter(
    (inst) => inst.id !== currentInstanceId && inst.apiKey !== 'placeholder',
  )

  return (
    <Select
      onValueChange={(value) => {
        const currentSyncs = field.value || []
        const valueNum = Number.parseInt(value)
        if (currentSyncs.includes(valueNum)) {
          field.onChange(currentSyncs.filter((id: number) => id !== valueNum))
        } else {
          field.onChange([...currentSyncs, valueNum])
        }
      }}
      value={field.value?.[0]?.toString() || ''}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Select instances to sync with" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {availableInstances.map((instance) => (
          <SelectItem
            key={instance.id}
            value={instance.id.toString()}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex-1">{instance.name}</div>
              {field.value?.includes(instance.id) && (
                <Check className="h-4 w-4" />
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default SyncedInstancesSelect
