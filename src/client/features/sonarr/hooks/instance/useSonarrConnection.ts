import { useState, useCallback, useRef, useEffect } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useToast } from '@/hooks/use-toast'
import type {
  SonarrInstance,
  SonarrConnectionValues,
} from '@/features/sonarr/store/types'

export function useSonarrConnection(
  instance: SonarrInstance,
  setShowInstanceCard?: (show: boolean) => void,
) {
  const [testStatus, setTestStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [isConnectionValid, setIsConnectionValid] = useState(false)
  const isNavigationTest = useRef(false)
  const hasInitialized = useRef(false)
  const { toast } = useToast()

  const {
    instances,
    fetchInstanceData,
    fetchInstances,
    updateInstance,
    setLoadingWithMinDuration: setInstancesLoading,
  } = useSonarrStore()

  const testConnectionWithoutLoading = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )
      const [response] = await Promise.all([
        fetch(
          `/v1/sonarr/test-connection?baseUrl=${encodeURIComponent(baseUrl)}&apiKey=${encodeURIComponent(apiKey)}`,
        ),
        minimumLoadingTime,
      ])
      if (!response.ok) {
        throw new Error('Failed to test connection')
      }
      return await response.json()
    },
    [],
  )

  // Initialize component and test connection on mount
  useEffect(() => {
    const initializeComponent = async () => {
      if (hasInitialized.current) return
      hasInitialized.current = true

      const hasInstanceData =
        instance.data?.rootFolders && instance.data?.qualityProfiles
      const isPlaceholderKey = instance.apiKey === 'placeholder'

      if (instance.id === -1) {
        return
      }

      if (hasInstanceData) {
        setIsConnectionValid(true)
        setTestStatus('success')
      } else if (instance.baseUrl && instance.apiKey && !isPlaceholderKey) {
        isNavigationTest.current = true
        setInstancesLoading(true)
        try {
          const result = await testConnectionWithoutLoading(
            instance.baseUrl,
            instance.apiKey,
          )
          if (result.success) {
            setIsConnectionValid(true)
            setTestStatus('success')
            if (
              !instance.data?.rootFolders ||
              !instance.data?.qualityProfiles
            ) {
              await fetchInstanceData(instance.id.toString())
            }
          }
        } catch (error) {
          console.error('Silent connection test failed:', error)
        } finally {
          setInstancesLoading(false)
          isNavigationTest.current = false
        }
      }
    }

    initializeComponent()
  }, [
    instance.id,
    instance.data?.rootFolders,
    instance.data?.qualityProfiles,
    instance.baseUrl,
    instance.apiKey,
    testConnectionWithoutLoading,
    fetchInstanceData,
    setInstancesLoading,
  ])

  const testConnection = useCallback(
    async (values: SonarrConnectionValues, form: any) => {
      if (!values.name?.trim()) {
        toast({
          title: 'Name Required',
          description:
            'Please provide an instance name before testing connection',
          variant: 'destructive',
        })
        return
      }

      setTestStatus('loading')
      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        await Promise.all([
          (async () => {
            const testResult = await testConnectionWithoutLoading(
              values.baseUrl,
              values.apiKey,
            )
            if (!testResult.success) {
              throw new Error(
                testResult.message || 'Failed to connect to Sonarr',
              )
            }

            const isOnlyPlaceholderInstance =
              instances.length === 1 && instances[0].apiKey === 'placeholder'

            if (isOnlyPlaceholderInstance) {
              await updateInstance(instances[0].id, {
                name: values.name.trim(),
                baseUrl: values.baseUrl,
                apiKey: values.apiKey,
                isDefault: true,
              })
              await fetchInstances()
              await fetchInstanceData(instances[0].id.toString())
              setShowInstanceCard?.(false)
            } else if (instance.id === -1) {
              setIsConnectionValid(true)
              setTestStatus('success')
              form.clearErrors()
              const isValid = await form.trigger([
                'qualityProfile',
                'rootFolder',
              ])
              if (!isValid) return

              const createResponse = await fetch('/v1/sonarr/instances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: values.name.trim(),
                  baseUrl: values.baseUrl,
                  apiKey: values.apiKey,
                  qualityProfile: values.qualityProfile,
                  rootFolder: values.rootFolder,
                  isDefault: false,
                }),
              })

              if (!createResponse.ok) {
                throw new Error('Failed to create instance')
              }

              const newInstance = await createResponse.json()

              await Promise.all([
                fetchInstances(),
                fetchInstanceData(newInstance.id.toString()),
              ])

              setShowInstanceCard?.(false)
            } else {
              await fetchInstanceData(instance.id.toString())
            }
          })(),
          minimumLoadingTime,
        ])

        if (!instance.id || instance.id !== -1) {
          setTestStatus('success')
          setIsConnectionValid(true)
          toast({
            title: 'Connection Successful',
            description: 'Successfully connected to Sonarr',
            variant: 'default',
          })
        }
      } catch (error) {
        setTestStatus('error')
        setIsConnectionValid(false)
        toast({
          title: 'Connection Failed',
          description:
            error instanceof Error
              ? error.message
              : 'Failed to connect to Sonarr',
          variant: 'destructive',
        })
      }
    },
    [
      instance,
      instances,
      testConnectionWithoutLoading,
      updateInstance,
      fetchInstances,
      fetchInstanceData,
      toast,
      setShowInstanceCard,
    ],
  )

  const resetConnection = useCallback(() => {
    setTestStatus('idle')
    setIsConnectionValid(false)
    hasInitialized.current = false
  }, [])

  return {
    testStatus,
    setTestStatus,
    saveStatus,
    setSaveStatus,
    isConnectionValid,
    setIsConnectionValid,
    isNavigationTest,
    hasInitialized,
    testConnection,
    testConnectionWithoutLoading,
    resetConnection,
  }
}
