import { useState, useCallback, useRef, useEffect } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useToast } from '@/hooks/use-toast'
import type {
  SonarrInstance,
  SonarrConnectionValues,
} from '@/features/sonarr/types/types'
import type { UseFormReturn } from 'react-hook-form'
import type { SonarrInstanceSchema } from '@/features/sonarr/store/schemas'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

/**
 * Checks if a Sonarr instance is missing required configuration fields.
 *
 * Returns true if either the quality profile or root folder is not set, indicating that the instance needs further setup.
 *
 * @param instance - The Sonarr instance to check for configuration completeness.
 * @returns True if the instance requires additional configuration; false if it is fully configured.
 */
function checkNeedsConfiguration(instance: SonarrInstance) {
  return (
    !instance.qualityProfile ||
    instance.qualityProfile === '' ||
    !instance.rootFolder ||
    instance.rootFolder === ''
  )
}

/**
 * React hook for managing the connection state, validation, and configuration requirements of a Sonarr instance.
 *
 * Provides state and utility functions to test and reset the connection, track connection and save statuses, determine if additional configuration is needed, and handle instance creation, updating, and data fetching as part of the Sonarr connection workflow.
 *
 * @param instance - The Sonarr instance to manage.
 * @param setShowInstanceCard - Optional callback to control the visibility of the instance card UI.
 * @returns An object containing connection and configuration state, status setters, refs, and functions for testing and resetting the connection.
 */
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
  const [needsConfiguration, setNeedsConfiguration] = useState(false)
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
        try {
          const error = await response.json()
          throw new Error(error.message || 'Failed to test connection')
        } catch (parseError) {
          throw new Error('Failed to test connection')
        }
      }
      return await response.json()
    },
    [],
  )

  // Check if the instance needs configuration (missing required fields)
  useEffect(() => {
    // Only check when we have a valid instance
    if (instance.id > 0) {
      const needsConfig = checkNeedsConfiguration(instance)
      setNeedsConfiguration(needsConfig)
    }
  }, [instance])

  // Initialize component and test connection on mount
  useEffect(() => {
    const initializeComponent = async () => {
      if (hasInitialized.current) return
      hasInitialized.current = true

      const hasInstanceData =
        instance.data?.rootFolders && instance.data?.qualityProfiles
      const isPlaceholderKey = instance.apiKey === API_KEY_PLACEHOLDER

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

            // Check if the instance needs additional configuration
            // ONLY consider it needing configuration if it's missing quality profile or root folder
            const needsConfig = checkNeedsConfiguration(instance)

            if (needsConfig) {
              setNeedsConfiguration(true)
            } else {
              setNeedsConfiguration(false)
            }

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
    instance,
    testConnectionWithoutLoading,
    fetchInstanceData,
    setInstancesLoading,
  ])

  const testConnection = useCallback(
    async (
      values: SonarrConnectionValues,
      form: UseFormReturn<SonarrInstanceSchema>,
    ) => {
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

            form.setValue('_originalBaseUrl', values.baseUrl, {
              shouldDirty: false,
            })
            form.setValue('_originalApiKey', values.apiKey, {
              shouldDirty: false,
            })
            form.setValue('_connectionTested', true, {
              shouldDirty: false,
              shouldValidate: true,
            })

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

              // Check if required fields were provided
              const hasRequiredFields = !checkNeedsConfiguration({
                ...instance,
                qualityProfile: values.qualityProfile,
                rootFolder: values.rootFolder,
              })
              if (!hasRequiredFields) {
                setNeedsConfiguration(true)
              } else {
                setNeedsConfiguration(false)
              }

              await Promise.all([
                fetchInstances(),
                fetchInstanceData(newInstance.id.toString()),
              ])

              // Always close the add instance form - we'll show the persisted one from the database instead
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
        form.setValue('_connectionTested', false, { shouldValidate: true })
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
    setNeedsConfiguration(false)
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
    needsConfiguration,
    setNeedsConfiguration,
    testConnection,
    testConnectionWithoutLoading,
    resetConnection,
  }
}
