import { useMemo } from 'react'
import type { RadarrInstance } from '@/features/radarr/store/radarrStore'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { Computer } from 'lucide-react'

/**
 * Provides a list of Radarr instances available for synchronization, excluding the current instance and those with a placeholder API key.
 *
 * @param currentInstanceId - The ID of the currently selected Radarr instance to exclude from the list
 * @param instances - The array of all Radarr instances to filter
 * @returns An object containing the `availableInstances` array, each with `value`, `label`, and `icon` properties
 */
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
