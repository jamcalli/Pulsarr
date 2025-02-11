import { useCallback } from 'react'
import { useRadarrStore } from '@/stores/radarrStore'
import { useToast } from '@/hooks/use-toast'
import type { RadarrInstanceSchema } from '@/types/radarr/schemas'

export function useRadarrInstance(instanceId: number) {
  const { toast } = useToast()
  const instance = useRadarrStore(state => state.instances.find(i => i.id === instanceId))
  const instances = useRadarrStore(state => state.instances)
  const updateInstance = useRadarrStore(state => state.updateInstance)
  const deleteInstance = useRadarrStore(state => state.deleteInstance)
  const fetchInstanceData = useRadarrStore(state => state.fetchInstanceData)
  const fetchInstances = useRadarrStore(state => state.fetchInstances)

  const handleUpdateInstance = useCallback(async (data: RadarrInstanceSchema) => {
    if (data.isDefault) {
      const updatePromises = instances
        .filter(inst => inst.id !== instanceId && inst.isDefault)
        .map(inst => updateInstance(inst.id, {
          ...inst,
          isDefault: false,
          syncedInstances: []
        }))

      await Promise.all(updatePromises)
    }

    await updateInstance(instanceId, {
      ...data,
      name: data.name.trim(),
      syncedInstances: data.syncedInstances || []
    })
  }, [instanceId, instances, updateInstance])

  const handleDeleteInstance = useCallback(async (
    form: any,
    setIsConnectionValid: (valid: boolean) => void,
    setTestStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void
  ) => {
    const isLastRealInstance = instances.filter(i => i.apiKey !== 'placeholder').length === 1
  
    try {
      if (isLastRealInstance) {
        const defaultInstance: RadarrInstanceSchema = {
          name: 'Default Radarr Instance',
          baseUrl: 'http://localhost:7878',
          apiKey: 'placeholder',
          qualityProfile: '',
          rootFolder: '',
          bypassIgnored: false,
          tags: [],
          isDefault: false,
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
  
      toast({
        title: isLastRealInstance ? 'Configuration Cleared' : 'Instance Deleted',
        description: isLastRealInstance
          ? 'Radarr configuration has been cleared'
          : 'Radarr instance has been deleted',
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
  }, [instanceId, instances, updateInstance, deleteInstance, fetchInstances, toast])

  return {
    instance,
    instances,
    updateInstance: handleUpdateInstance,
    deleteInstance: handleDeleteInstance,
    fetchInstanceData: () => fetchInstanceData(instanceId.toString())
  }
}