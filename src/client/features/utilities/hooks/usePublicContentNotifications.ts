import { zodResolver } from '@hookform/resolvers/zod'
import { ConfigSchema } from '@root/schemas/config/config.schema'
import type { WebhookValidationResponse } from '@root/schemas/notifications/discord-control.schema'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useDebounce } from '@/hooks/useDebounce'
import { useConfigStore } from '@/stores/configStore'
import { discordWebhookStringSchema } from '@/utils/discord-webhook-validation'

// Extract API schema and extend with testing fields
const ApiPublicContentNotificationsSchema =
  ConfigSchema.shape.publicContentNotifications.unwrap()

const publicContentNotificationsSchema =
  ApiPublicContentNotificationsSchema.extend({
    // Replace simple strings with Discord webhook validation
    discordWebhookUrls: discordWebhookStringSchema,
    discordWebhookUrlsMovies: discordWebhookStringSchema,
    discordWebhookUrlsShows: discordWebhookStringSchema,
    // Hidden fields to track connection testing
    _generalTested: z.boolean().default(false),
    _moviesTested: z.boolean().default(false),
    _showsTested: z.boolean().default(false),
  })

export type PublicContentNotificationsFormValues = z.input<
  typeof publicContentNotificationsSchema
>

interface TestStatus {
  isTestingGeneral: boolean
  isTestingMovies: boolean
  isTestingShows: boolean
  testResults: {
    general: boolean | null
    movies: boolean | null
    shows: boolean | null
  }
}

/**
 * React hook for managing public content notification settings, including form state, validation, Discord webhook connection testing, and persistence.
 *
 * Provides synchronized form management with the configuration store, schema-based validation, and user feedback for testing and saving Discord webhook and Apprise notification URLs. Exposes handlers for submitting, toggling, canceling, testing, and clearing notification fields, along with loading and test status indicators.
 *
 * @returns An object containing the form instance, loading states, webhook test status, Apprise enablement flag, and handler functions for notification configuration operations.
 */
export function usePublicContentNotifications() {
  const { config, updateConfig } = useConfigStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>({
    isTestingGeneral: false,
    isTestingMovies: false,
    isTestingShows: false,
    testResults: {
      general: null,
      movies: null,
      shows: null,
    },
  })

  // Initialize form with default values
  const form = useForm<z.input<typeof publicContentNotificationsSchema>>({
    resolver: zodResolver(publicContentNotificationsSchema),
    defaultValues: {
      enabled: config?.publicContentNotifications?.enabled || false,
      discordWebhookUrls:
        config?.publicContentNotifications?.discordWebhookUrls || '',
      discordWebhookUrlsMovies:
        config?.publicContentNotifications?.discordWebhookUrlsMovies || '',
      discordWebhookUrlsShows:
        config?.publicContentNotifications?.discordWebhookUrlsShows || '',
      appriseUrls: config?.publicContentNotifications?.appriseUrls || '',
      appriseUrlsMovies:
        config?.publicContentNotifications?.appriseUrlsMovies || '',
      appriseUrlsShows:
        config?.publicContentNotifications?.appriseUrlsShows || '',
      _generalTested: false,
      _moviesTested: false,
      _showsTested: false,
    },
    mode: 'onChange',
  })

  // Update form when config changes
  useEffect(() => {
    if (config) {
      const formValues = {
        enabled: config.publicContentNotifications?.enabled || false,
        discordWebhookUrls:
          config.publicContentNotifications?.discordWebhookUrls || '',
        discordWebhookUrlsMovies:
          config.publicContentNotifications?.discordWebhookUrlsMovies || '',
        discordWebhookUrlsShows:
          config.publicContentNotifications?.discordWebhookUrlsShows || '',
        appriseUrls: config.publicContentNotifications?.appriseUrls || '',
        appriseUrlsMovies:
          config.publicContentNotifications?.appriseUrlsMovies || '',
        appriseUrlsShows:
          config.publicContentNotifications?.appriseUrlsShows || '',
        _generalTested: false,
        _moviesTested: false,
        _showsTested: false,
      }
      form.reset(formValues)
    }
  }, [config, form])

  // Watch for changes to trigger form validation
  useEffect(() => {
    const subscription = form.watch(() => {
      if (form.formState.isDirty) {
        form.trigger()
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  // Debounced validation function
  const debouncedValidation = useDebounce(
    (fieldName: string, value: string) => {
      if (value && value.length > 0) {
        form.setError(fieldName as keyof PublicContentNotificationsFormValues, {
          type: 'manual',
          message: 'Please test connection before saving',
        })
      }
    },
    300,
  )

  // Reset testing states when URLs change
  useEffect(() => {
    const subscription = form.watch((_, { name }) => {
      if (name === 'discordWebhookUrls') {
        form.setValue('_generalTested', false, { shouldValidate: true })
        setTestStatus((prev) => ({
          ...prev,
          testResults: { ...prev.testResults, general: null },
        }))
        const url = form.getValues('discordWebhookUrls')
        debouncedValidation('discordWebhookUrls', url || '')
      } else if (name === 'discordWebhookUrlsMovies') {
        form.setValue('_moviesTested', false, { shouldValidate: true })
        setTestStatus((prev) => ({
          ...prev,
          testResults: { ...prev.testResults, movies: null },
        }))
        const url = form.getValues('discordWebhookUrlsMovies')
        debouncedValidation('discordWebhookUrlsMovies', url || '')
      } else if (name === 'discordWebhookUrlsShows') {
        form.setValue('_showsTested', false, { shouldValidate: true })
        setTestStatus((prev) => ({
          ...prev,
          testResults: { ...prev.testResults, shows: null },
        }))
        const url = form.getValues('discordWebhookUrlsShows')
        debouncedValidation('discordWebhookUrlsShows', url || '')
      }
    })
    return () => subscription.unsubscribe()
  }, [form, debouncedValidation])

  // Helper function to validate Discord webhook URL using the same endpoint as notifications
  const validateDiscordWebhook = useCallback(
    async (url: string): Promise<WebhookValidationResponse> => {
      // Trim the input and treat whitespace-only as empty
      const trimmed = url?.trim() ?? ''
      if (trimmed.length === 0) {
        return {
          success: false,
          valid: false,
          urls: [],
          message: 'No webhook URLs provided',
        }
      }

      try {
        // Call the same backend validation endpoint used by notifications
        const response = await fetch('/v1/notifications/validatewebhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ webhookUrls: trimmed }),
        })

        if (!response.ok) {
          let message = 'Error validating webhooks'
          try {
            const errorData = await response.json()
            message = errorData?.message ?? message
          } catch (_) {
            // Ignore JSON parse failures and use default message
          }
          return {
            success: false,
            valid: false,
            urls: [],
            message,
          }
        }

        const result = await response.json()
        return result
      } catch (error) {
        console.error('Webhook validation error:', error)
        return {
          success: false,
          valid: false,
          urls: [],
          message:
            error instanceof Error
              ? error.message
              : 'Failed to validate webhook',
        }
      }
    },
    [],
  )

  // Handle Discord webhook testing
  const handleTestDiscordWebhook = useCallback(
    async (type: 'general' | 'movies' | 'shows') => {
      const urlField =
        type === 'general'
          ? 'discordWebhookUrls'
          : type === 'movies'
            ? 'discordWebhookUrlsMovies'
            : 'discordWebhookUrlsShows'

      const testingField =
        type === 'general'
          ? 'isTestingGeneral'
          : type === 'movies'
            ? 'isTestingMovies'
            : 'isTestingShows'

      const testedField =
        type === 'general'
          ? '_generalTested'
          : type === 'movies'
            ? '_moviesTested'
            : '_showsTested'

      const url = form.getValues(urlField)

      if (!url?.trim()) {
        toast.error('Please enter webhook URLs to test')
        return
      }

      setTestStatus((prev) => ({
        ...prev,
        [testingField]: true,
      }))

      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        const [result] = await Promise.all([
          validateDiscordWebhook(url),
          minimumLoadingTime,
        ])

        setTestStatus((prev) => ({
          ...prev,
          testResults: {
            ...prev.testResults,
            [type]: result.valid,
          },
        }))

        if (result.valid) {
          form.setValue(testedField, true, { shouldValidate: true })
          form.clearErrors(urlField)

          // Update form with deduplicated URLs if duplicates were removed
          if (
            result.duplicateCount &&
            result.duplicateCount > 0 &&
            result.urls
          ) {
            const deduplicatedUrls = result.urls
              .map((url: { url: string }) => url.url)
              .join(',')
            form.setValue(urlField, deduplicatedUrls, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }

          // Get webhook count for user feedback
          const webhookCount = result.urls?.length || 1
          let countText =
            webhookCount === 1
              ? 'Discord webhook URL is valid!'
              : `All ${webhookCount} Discord webhook URLs are valid!`

          // Add information about duplicates if any were found
          if (result.duplicateCount && result.duplicateCount > 0) {
            countText += ` (${result.duplicateCount} duplicate ${
              result.duplicateCount === 1 ? 'URL was' : 'URLs were'
            } removed)`
          }

          if (result.duplicateCount && result.duplicateCount > 0) {
            toast.error(countText)
          } else {
            toast.success(countText)
          }
        } else {
          form.setValue(testedField, false, { shouldValidate: true })
          form.setError(urlField, {
            type: 'manual',
            message: 'Please test connection before saving',
          })
          toast.error(`Webhook validation failed: ${result.message}`)
        }
      } catch (error) {
        console.error('Webhook test error:', error)
        form.setValue(testedField, false, { shouldValidate: true })
        form.setError(urlField, {
          type: 'manual',
          message: 'Please test connection before saving',
        })
        setTestStatus((prev) => ({
          ...prev,
          testResults: {
            ...prev.testResults,
            [type]: false,
          },
        }))
        toast.error('Failed to validate webhook URLs')
      } finally {
        setTestStatus((prev) => ({
          ...prev,
          [testingField]: false,
        }))
      }
    },
    [form, validateDiscordWebhook],
  )

  // Handle form submission
  const onSubmit = useCallback(
    async (data: PublicContentNotificationsFormValues) => {
      setIsSubmitting(true)

      try {
        // Transform form data to ensure proper types for backend
        const transformedData = publicContentNotificationsSchema.parse(data)

        // Apply minimum loading time for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Strip out testing fields before saving
        const { _generalTested, _moviesTested, _showsTested, ...configData } =
          transformedData

        await Promise.all([
          updateConfig({
            publicContentNotifications: configData,
          }),
          minimumLoadingTime,
        ])

        toast.success(
          'Public content notifications settings saved successfully',
        )

        // Reset form with updated data (keep testing states)
        form.reset(data)
      } catch (error) {
        console.error('Failed to save public content notifications:', error)

        toast.error('Failed to save public content notifications settings')

        // Re-throw the error so calling functions can handle it
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [updateConfig, form],
  )

  // Handle toggle enable/disable with consistent loading patterns
  const handleToggle = useCallback(
    async (newEnabledState: boolean) => {
      setIsToggling(true)

      try {
        // Apply minimum loading time for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Strip internal flags before persisting
        const { _generalTested, _moviesTested, _showsTested, ...cleanValues } =
          form.getValues()
        const formData = { ...cleanValues, enabled: newEnabledState }

        await Promise.all([
          updateConfig({
            publicContentNotifications: formData,
          }),
          minimumLoadingTime,
        ])

        // Only update form state if the API call succeeds
        form.setValue('enabled', newEnabledState, { shouldDirty: false })

        toast.success(
          `Public content notifications ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
        )
      } catch (error) {
        console.error('Failed to toggle public content notifications:', error)

        toast.error(
          `Failed to ${newEnabledState ? 'enable' : 'disable'} public content notifications`,
        )

        // Re-throw the error for the component to handle
        throw error
      } finally {
        setIsToggling(false)
      }
    },
    [updateConfig, form],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (config) {
      const formValues = {
        enabled: config.publicContentNotifications?.enabled || false,
        discordWebhookUrls:
          config.publicContentNotifications?.discordWebhookUrls || '',
        discordWebhookUrlsMovies:
          config.publicContentNotifications?.discordWebhookUrlsMovies || '',
        discordWebhookUrlsShows:
          config.publicContentNotifications?.discordWebhookUrlsShows || '',
        appriseUrls: config.publicContentNotifications?.appriseUrls || '',
        appriseUrlsMovies:
          config.publicContentNotifications?.appriseUrlsMovies || '',
        appriseUrlsShows:
          config.publicContentNotifications?.appriseUrlsShows || '',
        _generalTested: false,
        _moviesTested: false,
        _showsTested: false,
      }
      form.reset(formValues)
      // Reset test status
      setTestStatus({
        isTestingGeneral: false,
        isTestingMovies: false,
        isTestingShows: false,
        testResults: {
          general: null,
          movies: null,
          shows: null,
        },
      })
    }
  }, [config, form])

  // Handle clearing individual field URLs
  const handleClearField = useCallback(
    async (
      fieldName: Exclude<keyof PublicContentNotificationsFormValues, 'enabled'>,
    ) => {
      setIsClearing(true)

      try {
        // Apply minimum loading time for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Get current form values and clear the specific field
        const currentValues = form.getValues()
        const clearedData = {
          ...currentValues,
          [fieldName]: '',
        }

        // Remove testing fields before saving
        const { _generalTested, _moviesTested, _showsTested, ...configData } =
          clearedData

        await Promise.all([
          updateConfig({
            publicContentNotifications: configData,
          }),
          minimumLoadingTime,
        ])

        // Update form with cleared field
        form.setValue(fieldName, '', { shouldDirty: false })

        // Reset test status for the cleared field
        if (fieldName === 'discordWebhookUrls') {
          setTestStatus((prev) => ({
            ...prev,
            testResults: { ...prev.testResults, general: null },
          }))
        } else if (fieldName === 'discordWebhookUrlsMovies') {
          setTestStatus((prev) => ({
            ...prev,
            testResults: { ...prev.testResults, movies: null },
          }))
        } else if (fieldName === 'discordWebhookUrlsShows') {
          setTestStatus((prev) => ({
            ...prev,
            testResults: { ...prev.testResults, shows: null },
          }))
        }

        const fieldLabels: Record<string, string> = {
          discordWebhookUrls: 'General Discord webhook URLs',
          discordWebhookUrlsMovies: 'Movie Discord webhook URLs',
          discordWebhookUrlsShows: 'Show Discord webhook URLs',
          appriseUrls: 'General Apprise URLs',
          appriseUrlsMovies: 'Movie Apprise URLs',
          appriseUrlsShows: 'Show Apprise URLs',
        }

        toast.success(`${fieldLabels[fieldName as string]} have been cleared`)
      } catch (error) {
        console.error(`Failed to clear ${fieldName}:`, error)

        toast.error(`Failed to clear ${fieldName}`)

        // Re-throw the error for the component to handle
        throw error
      } finally {
        setIsClearing(false)
      }
    },
    [updateConfig, form],
  )

  return {
    form,
    isSubmitting,
    isToggling,
    isClearing,
    testStatus,
    isAppriseEnabled: config?.enableApprise || false,
    onSubmit,
    handleCancel,
    handleToggle,
    handleTestDiscordWebhook,
    handleClearField,
  }
}
