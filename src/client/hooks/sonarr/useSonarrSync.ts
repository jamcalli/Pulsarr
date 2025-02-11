import { useMemo } from 'react'
import type { SonarrInstance } from '@/stores/sonarrStore'
import { Computer } from 'lucide-react'

export function useSonarrSync(currentInstanceId: number, instances: SonarrInstance[]) {
  const availableInstances = useMemo(() => 
    instances
      .filter(inst => 
        inst.id !== currentInstanceId && 
        inst.apiKey !== 'placeholder'
      )
      .map(instance => ({
        value: instance.id.toString(),
        label: instance.name,
        icon: Computer
      }))
  , [currentInstanceId, instances])

  return {
    availableInstances
  }
}