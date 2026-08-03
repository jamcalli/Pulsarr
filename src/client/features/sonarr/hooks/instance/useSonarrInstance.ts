import { useCallback } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import {
  useDeleteSonarrInstanceMutation,
  useSonarrInstancesQuery,
  useUpdateSonarrInstanceMutation,
} from '@/features/sonarr/hooks/instance/useSonarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'

/**
 * React hook for managing a specific Sonarr instance by ID, providing access to instance data and handlers for updating and deleting it.
 *
 * If the last real Sonarr instance is deleted, it is replaced with a default placeholder configuration to ensure at least one instance remains.
 *
 * @param instanceId - The ID of the Sonarr instance to manage.
 * @returns An object containing the current instance, all instances, pending states, and functions to update and delete the specified instance.
 */
export function useSonarrInstance(instanceId: number) {
  const instancesQuery = useSonarrInstancesQuery()
  const instances = instancesQuery.data ?? []
  const instance = instances.find((i) => i.id === instanceId)
  const updateMutation = useUpdateSonarrInstanceMutation()
  const deleteMutation = useDeleteSonarrInstanceMutation()
  const { mutateAsync: updateAsync } = updateMutation
  const { mutateAsync: deleteAsync } = deleteMutation

  const handleUpdateInstance = useCallback(
    async (data: SonarrInstanceSchema) => {
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
      form: UseFormReturn<SonarrInstanceSchema>,
      setIsConnectionValid: (valid: boolean) => void,
      setTestStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void,
    ) => {
      const isLastRealInstance =
        instances.filter((i) => i.apiKey !== API_KEY_PLACEHOLDER).length === 1

      try {
        if (isLastRealInstance) {
          const defaultInstance: SonarrInstanceSchema = {
            name: 'Default Sonarr Instance',
            baseUrl: 'http://localhost:8989',
            apiKey: API_KEY_PLACEHOLDER,
            qualityProfile: '',
            rootFolder: '',
            bypassIgnored: false,
            seasonMonitoring: 'all',
            monitorNewItems: 'all',
            searchOnAdd: true,
            createSeasonFolders: false,
            tags: [],
            isDefault: true, // Always set placeholder instance as default
            syncedInstances: [],
            seriesType: 'standard',
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
            ? 'Sonarr configuration has been cleared'
            : 'Sonarr instance has been deleted',
        )
      } catch (error) {
        toast.error('Failed to delete instance')
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
