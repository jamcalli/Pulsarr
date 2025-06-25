import { useMemo } from 'react'
import type { SonarrInstance } from '@/features/sonarr/store/sonarrStore'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'
import { Computer } from 'lucide-react'

export function useSonarrSync(
  currentInstanceId: number,
  instances: SonarrInstance[],
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
