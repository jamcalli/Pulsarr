import { useCallback } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import {
  useDeleteRadarrInstanceMutation,
  useRadarrInstancesQuery,
  useUpdateRadarrInstanceMutation,
} from '@/features/radarr/hooks/instance/useRadarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'

/**
 * React hook for managing a specific Radarr instance by its ID.
 *
 * Returns the current instance, all instances, and handler functions to update and delete it. If the last real instance is deleted, it is replaced with a default placeholder configuration.
 *
 * @param instanceId - The ID of the Radarr instance to manage.
 * @returns An object containing the current instance, all instances, pending states, and functions to update and delete the specified instance.
 */
export function useRadarrInstance(instanceId: number) {
  const instancesQuery = useRadarrInstancesQuery()
  const instances = instancesQuery.data ?? []
  const instance = instances.find((i) => i.id === instanceId)
  const updateMutation = useUpdateRadarrInstanceMutation()
  const deleteMutation = useDeleteRadarrInstanceMutation()
  const { mutateAsync: updateAsync } = updateMutation
  const { mutateAsync: deleteAsync } = deleteMutation

  const handleUpdateInstance = useCallback(
    async (data: RadarrInstanceSchema) => {
      await updateAsync({
        id: instanceId,
        updates: {
          ...data,
          name: data.name.trim(),
          syncedInstances: data.syncedInstances || [],
        },
      })
    },
    [instanceId, updateAsync],
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

          await updateAsync({ id: instanceId, updates: defaultInstance })

          form.reset(defaultInstance, {
            keepDirty: false,
            keepIsSubmitted: false,
            keepTouched: false,
            keepIsValid: false,
            keepErrors: false,
          })
        } else {
          await deleteAsync(instanceId)
        }

        setIsConnectionValid(false)
        setTestStatus('idle')

        toast.success(
          isLastRealInstance
            ? 'Radarr configuration has been cleared'
            : 'Radarr instance has been deleted',
        )
      } catch (error) {
        toast.error(
          isLastRealInstance
            ? 'Failed to clear Radarr configuration'
            : 'Failed to delete instance',
        )
        throw error
      }
    },
    [instanceId, instances, updateAsync, deleteAsync],
  )

  return {
    instance,
    instances,
    updateInstance: handleUpdateInstance,
    deleteInstance: handleDeleteInstance,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
