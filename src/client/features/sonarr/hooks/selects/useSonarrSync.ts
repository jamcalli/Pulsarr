import { useMemo } from 'react'
import type { SonarrInstance } from '@/features/sonarr/store/sonarrStore'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'
import { Computer } from 'lucide-react'

/**
 * Provides a list of Sonarr instances available for synchronization, excluding the current instance and those with a placeholder API key.
 *
 * @param currentInstanceId - The ID of the currently selected Sonarr instance to exclude from the list
 * @param instances - The array of all Sonarr instances to filter
 * @returns An object containing `availableInstances`, an array of selectable instance options with `value`, `label`, and `icon` properties
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
