import { useCallback } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useToast } from '@/hooks/use-toast'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import type { UseFormReturn } from 'react-hook-form'

/**
 * Provides Sonarr instance data and management handlers for a specific instance ID.
 *
 * Returns the current Sonarr instance, all instances, and functions to update, delete, and fetch data for the specified instance.
 *
 * @param instanceId - The ID of the Sonarr instance to manage.
 * @returns An object containing the current instance, all instances, and handlers for updating, deleting, and fetching instance data.
 *
 * @remark If the last real Sonarr instance is deleted, it is replaced with a default placeholder configuration (including `seriesType: 'standard'` and `createSeasonFolders: false`) instead of being removed.
 */
export function useSonarrInstance(instanceId: number) {
  const { toast } = useToast()
  const instance = useSonarrStore((state) =>
    state.instances.find((i) => i.id === instanceId),
  )
  const instances = useSonarrStore((state) => state.instances)
  const updateInstance = useSonarrStore((state) => state.updateInstance)
  const deleteInstance = useSonarrStore((state) => state.deleteInstance)
  const fetchInstanceData = useSonarrStore((state) => state.fetchInstanceData)
  const fetchInstances = useSonarrStore((state) => state.fetchInstances)

  const handleUpdateInstance = useCallback(
    async (data: SonarrInstanceSchema) => {
      await updateInstance(instanceId, {
        ...data,
        name: data.name.trim(),
        syncedInstances: data.syncedInstances || [],
      })
    },
    [instanceId, updateInstance],
  )

  const handleDeleteInstance = useCallback(
    async (
      form: UseFormReturn<SonarrInstanceSchema>,
      setIsConnectionValid: (valid: boolean) => void,
      setTestStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void,
    ) => {
      const isLastRealInstance =
        instances.filter((i) => i.apiKey !== 'placeholder').length === 1

      try {
        if (isLastRealInstance) {
          const defaultInstance: SonarrInstanceSchema = {
            name: 'Default Sonarr Instance',
            baseUrl: 'http://localhost:8989',
            apiKey: 'placeholder',
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

        toast({
          title: isLastRealInstance
            ? 'Configuration Cleared'
            : 'Instance Deleted',
          description: isLastRealInstance
            ? 'Sonarr configuration has been cleared'
            : 'Sonarr instance has been deleted',
          variant: 'default',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete instance',
          variant: 'destructive',
        })
        throw error
      }
    },
    [
      instanceId,
      instances,
      updateInstance,
      deleteInstance,
      fetchInstances,
      toast,
    ],
  )

  return {
    instance,
    instances,
    updateInstance: handleUpdateInstance,
    deleteInstance: handleDeleteInstance,
    fetchInstanceData: () => fetchInstanceData(instanceId.toString()),
  }
}
