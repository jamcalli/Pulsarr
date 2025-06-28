import { useMemo } from 'react'
import type { SonarrInstance } from '@/features/sonarr/store/sonarrStore'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'
import { Computer } from 'lucide-react'

/**
 * Returns a list of Sonarr instances available for synchronization, excluding the current instance and those with a placeholder API key.
 *
 * @param currentInstanceId - The ID of the Sonarr instance to exclude from the results
 * @param instances - The list of all Sonarr instances to consider
 * @returns An object with `availableInstances`, an array of selectable options each containing `value`, `label`, and `icon`
 */
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
