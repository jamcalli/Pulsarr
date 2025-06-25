import { useMemo } from 'react'
import type { RadarrInstance } from '@/features/radarr/store/radarrStore'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { Computer } from 'lucide-react'

export function useRadarrSync(
  currentInstanceId: number,
  instances: RadarrInstance[],
) {
  const availableInstances = useMemo(
    () =>
      instances
        .filter(
          (inst) =>
            inst.id !== currentInstanceId &&
            inst.apiKey !== API_KEY_PLACEHOLDER,
        )
        .map((instance) => ({
          value: instance.id.toString(),
          label: instance.name,
          icon: Computer,
        })),
    [currentInstanceId, instances],
  )

  return {
    availableInstances,
  }
}
