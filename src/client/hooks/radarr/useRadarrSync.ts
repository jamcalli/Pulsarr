import { useMemo } from 'react'
import type { RadarrInstance } from '@/stores/radarrStore'
import { Computer } from 'lucide-react'

export function useRadarrSync(currentInstanceId: number, instances: RadarrInstance[]) {
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