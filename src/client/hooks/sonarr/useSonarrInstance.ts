import { useCallback } from 'react'
import { useSonarrStore } from '@/stores/sonarrStore'
import { useToast } from '@/hooks/use-toast'
import type { SonarrInstanceSchema } from '@/types/sonarr/schemas'

export function useSonarrInstance(instanceId: number) {
  const { toast } = useToast()
  const instance = useSonarrStore(state => state.instances.find(i => i.id === instanceId))
  const instances = useSonarrStore(state => state.instances)
  const updateInstance = useSonarrStore(state => state.updateInstance)
  const deleteInstance = useSonarrStore(state => state.deleteInstance)
  const fetchInstanceData = useSonarrStore(state => state.fetchInstanceData)
  const fetchInstances = useSonarrStore(state => state.fetchInstances)

  const handleUpdateInstance = useCallback(async (data: SonarrInstanceSchema) => {
    await updateInstance(instanceId, {
      ...data,
      name: data.name.trim(),
      syncedInstances: data.syncedInstances || []
    })
  }, [instanceId, updateInstance])

  const handleDeleteInstance = useCallback(async (
    form: any,
    setIsConnectionValid: (valid: boolean) => void,
    setTestStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void
  ) => {
    const isLastRealInstance = instances.filter(i => i.apiKey !== 'placeholder').length === 1
  
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
          tags: [],
          isDefault: false,
          syncedInstances: [],
        }
  
        await updateInstance(instanceId, {
          ...defaultInstance,
          qualityProfile: '', 
          rootFolder: '',     
        })
  
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
  }, [instanceId, instances, updateInstance, deleteInstance, fetchInstances, toast])

  return {
    instance,
    instances,
    updateInstance: handleUpdateInstance,
    deleteInstance: handleDeleteInstance,
    fetchInstanceData: () => fetchInstanceData(instanceId.toString())
  }
}