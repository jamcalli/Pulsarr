import { useCallback } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'

/**
 * React hook for managing a specific Radarr instance by its ID.
 *
 * Returns the current instance, all instances, and handler functions to update, delete, and fetch instance data. If the last real instance is deleted, it is replaced with a default placeholder configuration.
 *
 * @param instanceId - The ID of the Radarr instance to manage.
 * @returns An object containing the current instance, all instances, and functions to update, delete, and fetch instance data.
 */
export function useRadarrInstance(instanceId: number) {
  const instance = useRadarrStore((state) =>
    state.instances.find((i) => i.id === instanceId),
  )
  const instances = useRadarrStore((state) => state.instances)
  const updateInstance = useRadarrStore((state) => state.updateInstance)
  const deleteInstance = useRadarrStore((state) => state.deleteInstance)
  const fetchInstanceData = useRadarrStore((state) => state.fetchInstanceData)
  const fetchInstances = useRadarrStore((state) => state.fetchInstances)

  const handleUpdateInstance = useCallback(
    async (data: RadarrInstanceSchema) => {
      if (data.isDefault) {
        const updatePromises = instances
          .filter((inst) => inst.id !== instanceId && inst.isDefault)
          .map((inst) =>
            updateInstance(inst.id, {
              ...inst,
              isDefault: false,
              syncedInstances: [],
            }),
          )

        await Promise.all(updatePromises)
      }

      await updateInstance(instanceId, {
        ...data,
        name: data.name.trim(),
        syncedInstances: data.syncedInstances || [],
      })
    },
    [instanceId, instances, updateInstance],
  )

  const handleDeleteInstance = useCallback(
    async (
      form: UseFormReturn<RadarrInstanceSchema>,
      setIsConnectionValid: (valid: boolean) => void,
      setTestStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void,
    ) => {
      const isLastRealInstance =
        instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER).length === 1

      try {
        if (isLastRealInstance) {
          const defaultInstance: RadarrInstanceSchema = {
            name: 'Default Radarr Instance',
            baseUrl: 'http://localhost:7878',
            apiKey: API_KEY_PLACEHOLDER,
            qualityProfile: '',
            rootFolder: '',
            bypassIgnored: false,
            searchOnAdd: true,
            minimumAvailability: 'released',
            tags: [],
            isDefault: true, // Always set placeholder instance as default
            syncedInstances: [],
          }

          await updateInstance(instanceId, defaultInstance)

          form.reset(defaultInstance, {
            keepDirty: false,
            keepIsSubmitted: false,
            keepTouched: false,
            keepIsValid: false,
            keepErrors: false,
          })
        } else {
          await deleteInstance(instanceId)
        }

        setIsConnectionValid(false)
        setTestStatus('idle')
        await fetchInstances()

        toast.success(
          isLastRealInstance
            ? 'Radarr configuration has been cleared'
            : 'Radarr instance has been deleted',
        )
      } catch (error) {
        toast.error('Failed to delete instance')
        throw error
      }
    },
    [instanceId, instances, updateInstance, deleteInstance, fetchInstances],
  )

  return {
    instance,
    instances,
    updateInstance: handleUpdateInstance,
    deleteInstance: handleDeleteInstance,
    fetchInstanceData: () => fetchInstanceData(instanceId.toString()),
  }
}
