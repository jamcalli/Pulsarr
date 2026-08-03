import type { RadarrInstanceResponse } from '@root/schemas/radarr/radarr-instance.schema'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { useArrInstanceData } from '@/features/arr/useArrInstanceData'
import {
  createRadarrInstance,
  testRadarrConnection,
  updateRadarrInstance,
  useRadarrInstancesQuery,
} from '@/features/radarr/hooks/instance/useRadarrInstanceQueries'
import { API_KEY_PLACEHOLDER } from '@/features/radarr/store/constants'
import type { RadarrInstanceSchema } from '@/features/radarr/store/schemas'
import type { RadarrConnectionValues } from '@/features/radarr/types/types'
import { apiErrorMessage } from '@/lib/tanstackApi'
import { isWebhookCallbackError } from '@/lib/webhook-errors'

/**
 * Checks if a Radarr instance is missing required configuration fields.
 *
 * Returns `true` if either the `qualityProfile` or `rootFolder` property is missing or empty; otherwise, returns `false`.
 */
function checkNeedsConfiguration(instance: RadarrInstanceResponse) {
  return (
    !instance.qualityProfile ||
    instance.qualityProfile === '' ||
    !instance.rootFolder ||
    instance.rootFolder === ''
  )
}

/**
 * React hook for managing the connection lifecycle, configuration state, and UI status of a Radarr instance.
 *
 * Provides state and functions for testing and validating Radarr connections, tracking configuration requirements, and handling instance creation and updating as part of the Radarr connection workflow.
 *
 * @param instance - The Radarr instance to manage.
 * @param setShowInstanceCard - Optional callback to control the visibility of the instance card UI.
 * @returns An object containing connection and save statuses, configuration state, and functions for testing, resetting, and validating the Radarr connection.
 */
export function useRadarrConnection(
  instance: RadarrInstanceResponse,
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
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [isNavigationTesting, setIsNavigationTesting] = useState(false)
  const hasInitialized = useRef(false)

  const instancesQuery = useRadarrInstancesQuery()
  const instances = instancesQuery.data ?? []
  const instanceData = useArrInstanceData(
    'radarr',
    instance.id,
    isConnectionValid,
  )

  const testConnectionWithoutLoading = useCallback(
    async (baseUrl: string, apiKey: string) => {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )
      const [result] = await Promise.all([
        testRadarrConnection(baseUrl, apiKey),
        minimumLoadingTime,
      ])
      return result
    },
    [],
  )

  // Check if the instance needs configuration (missing required fields)
  useEffect(() => {
    if (instance.id > 0) {
      setNeedsConfiguration(checkNeedsConfiguration(instance))
    }
  }, [instance])

  // Validate the connection on mount; cached instance data counts as proof
  useEffect(() => {
    const initializeComponent = async () => {
      if (hasInitialized.current) return
      hasInitialized.current = true

      const isPlaceholderKey = instance.apiKey === API_KEY_PLACEHOLDER

      if (instance.id === -1) {
        return
      }

      if (instanceData.hasData) {
        setIsConnectionValid(true)
        setTestStatus('success')
      } else if (instance.baseUrl && instance.apiKey && !isPlaceholderKey) {
        setIsNavigationTesting(true)
        try {
          const result = await testConnectionWithoutLoading(
            instance.baseUrl,
            instance.apiKey,
          )
          if (result.success) {
            setIsConnectionValid(true)
            setTestStatus('success')
            setNeedsConfiguration(checkNeedsConfiguration(instance))
          }
        } catch (error) {
          console.error('Silent connection test failed:', error)
        } finally {
          setIsNavigationTesting(false)
        }
      }
    }

    initializeComponent()
  }, [instance, testConnectionWithoutLoading, instanceData.hasData])

  const { refetch: refetchInstanceData } = instanceData

  const testConnection = useCallback(
    async (
      values: RadarrConnectionValues,
      form: UseFormReturn<RadarrInstanceSchema>,
    ) => {
      if (!values.name?.trim()) {
        toast.error('Please provide an instance name before testing connection')
        return
      }

      setTestStatus('loading')
      setWebhookError(null) // Clear any previous webhook error before testing
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
                testResult.message || 'Failed to connect to Radarr',
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
              instances.length === 1 &&
              instances[0].apiKey === API_KEY_PLACEHOLDER

            if (isOnlyPlaceholderInstance) {
              await updateRadarrInstance(instances, instances[0].id, {
                name: values.name.trim(),
                baseUrl: values.baseUrl,
                apiKey: values.apiKey,
                isDefault: true,
                skipDefaultRoutingWhenNoMatch: form.getValues(
                  'skipDefaultRoutingWhenNoMatch',
                ),
              })
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

              await createRadarrInstance({
                name: values.name.trim(),
                baseUrl: values.baseUrl,
                apiKey: values.apiKey,
                qualityProfile: values.qualityProfile,
                rootFolder: values.rootFolder,
                isDefault: false,
              })

              const hasRequiredFields = !checkNeedsConfiguration({
                ...instance,
                qualityProfile: values.qualityProfile,
                rootFolder: values.rootFolder,
              })
              setNeedsConfiguration(!hasRequiredFields)

              // Always close the add instance form - we'll show the persisted one from the database instead
              setShowInstanceCard?.(false)
            } else {
              await refetchInstanceData()
            }
          })(),
          minimumLoadingTime,
        ])

        if (!instance.id || instance.id !== -1) {
          setTestStatus('success')
          setIsConnectionValid(true)
          toast.success('Successfully connected to Radarr')
        }
      } catch (error) {
        setTestStatus('error')
        setIsConnectionValid(false)
        form.setValue('_connectionTested', false, { shouldValidate: true })

        const errorMessage =
          apiErrorMessage(error) ?? 'Failed to connect to Radarr'

        // Check if this is a webhook callback error (Radarr can't reach Pulsarr)
        if (isWebhookCallbackError(errorMessage)) {
          setWebhookError(errorMessage)
        } else {
          toast.error(errorMessage)
        }
      }
    },
    [
      instance,
      instances,
      testConnectionWithoutLoading,
      refetchInstanceData,
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
    isNavigationTesting,
    needsConfiguration,
    setNeedsConfiguration,
    webhookError,
    setWebhookError,
    testConnection,
    testConnectionWithoutLoading,
    resetConnection,
  }
}
