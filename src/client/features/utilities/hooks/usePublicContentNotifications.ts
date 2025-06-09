import { useState, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import type { WebhookValidationResponse } from '@root/schemas/notifications/discord-control.schema'

/**
 * Converts a comma-separated string of webhook URLs into an array of trimmed, non-empty URLs.
 */
function parseWebhookUrls(value?: string): string[] {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) return []

  return trimmed
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
}

// Reusable Discord webhook URL validator
const discordWebhookString = z
  .string()
  .optional()
  .refine(
    (value): value is string => {
      const urls = parseWebhookUrls(value)
      if (urls.length === 0) {
        return value === undefined || value.trim() === ''
      }
      return urls.every((url) => url.includes('discord.com/api/webhooks'))
    },
    {
      message: 'All URLs must be valid Discord webhook URLs',
    },
  )
  .superRefine((value, ctx) => {
    const urls = parseWebhookUrls(value)
    if (urls.length === 0) return

    const invalidUrls = urls.filter(
      (url) => !url.includes('discord.com/api/webhooks'),
    )

    if (invalidUrls.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid Discord webhook URL${
          invalidUrls.length > 1 ? 's' : ''
        }: ${invalidUrls.join(', ')}`,
      })
    }
  })

// Create an enhanced schema with connection testing validation
const publicContentNotificationsSchema = z
  .object({
    enabled: z.boolean().default(false),
    discordWebhookUrls: discordWebhookString,
    discordWebhookUrlsMovies: discordWebhookString,
    discordWebhookUrlsShows: discordWebhookString,
    appriseUrls: z.string().optional(),
    appriseUrlsMovies: z.string().optional(),
    appriseUrlsShows: z.string().optional(),
    // Hidden fields to track connection testing
    _generalTested: z.boolean().default(false),
    _moviesTested: z.boolean().default(false),
    _showsTested: z.boolean().default(false),
  })
  .superRefine(() => {
    // Only require testing if enabled and URLs are provided AND the field is dirty
    // We'll handle the testing requirement in the component level validation
    // The schema validation will be used for URL format validation only
  })

export type PublicContentNotificationsFormValues = z.infer<
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
 * React hook for managing public content notifications configuration.
 *
 * Provides form state, validation, test connection functionality, and handlers for submitting and canceling configuration changes. Manages loading states for form submission and webhook testing operations, and integrates with the config store for persistence.
 *
 * @returns An object containing the form instance, loading states, test status, handlers for form operations and webhook testing, and configuration management functions.
 */
export function usePublicContentNotifications() {
  const { toast } = useToast()
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
  const form = useForm<PublicContentNotificationsFormValues>({
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
    if (config?.publicContentNotifications) {
      const formValues = {
        enabled: config.publicContentNotifications.enabled || false,
        discordWebhookUrls:
          config.publicContentNotifications.discordWebhookUrls || '',
        discordWebhookUrlsMovies:
          config.publicContentNotifications.discordWebhookUrlsMovies || '',
        discordWebhookUrlsShows:
          config.publicContentNotifications.discordWebhookUrlsShows || '',
        appriseUrls: config.publicContentNotifications.appriseUrls || '',
        appriseUrlsMovies:
          config.publicContentNotifications.appriseUrlsMovies || '',
        appriseUrlsShows:
          config.publicContentNotifications.appriseUrlsShows || '',
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
        if (url && url.length > 0) {
          form.setError('discordWebhookUrls', {
            type: 'manual',
            message: 'Please test connection before saving',
          })
        }
      } else if (name === 'discordWebhookUrlsMovies') {
        form.setValue('_moviesTested', false, { shouldValidate: true })
        setTestStatus((prev) => ({
          ...prev,
          testResults: { ...prev.testResults, movies: null },
        }))
        const url = form.getValues('discordWebhookUrlsMovies')
        if (url && url.length > 0) {
          form.setError('discordWebhookUrlsMovies', {
            type: 'manual',
            message: 'Please test connection before saving',
          })
        }
      } else if (name === 'discordWebhookUrlsShows') {
        form.setValue('_showsTested', false, { shouldValidate: true })
        setTestStatus((prev) => ({
          ...prev,
          testResults: { ...prev.testResults, shows: null },
        }))
        const url = form.getValues('discordWebhookUrlsShows')
        if (url && url.length > 0) {
          form.setError('discordWebhookUrlsShows', {
            type: 'manual',
            message: 'Please test connection before saving',
          })
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

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
        toast({
          description: 'Please enter webhook URLs to test',
          variant: 'destructive',
        })
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

          toast({
            description: countText,
            variant: 'default',
          })
        } else {
          form.setValue(testedField, false, { shouldValidate: true })
          form.setError(urlField, {
            type: 'manual',
            message: 'Please test connection before saving',
          })
          toast({
            description: `Webhook validation failed: ${result.message}`,
            variant: 'destructive',
          })
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
        toast({
          description: 'Failed to validate webhook URLs',
          variant: 'destructive',
        })
      } finally {
        setTestStatus((prev) => ({
          ...prev,
          [testingField]: false,
        }))
      }
    },
    [form, toast, validateDiscordWebhook],
  )

  // Handle form submission
  const onSubmit = useCallback(
    async (data: PublicContentNotificationsFormValues) => {
      setIsSubmitting(true)

      try {
        // Apply minimum loading time for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Strip out testing fields before saving
        const { _generalTested, _moviesTested, _showsTested, ...configData } =
          data

        await Promise.all([
          updateConfig({
            publicContentNotifications: configData,
          }),
          minimumLoadingTime,
        ])

        toast({
          description:
            'Public content notifications settings saved successfully',
          variant: 'default',
        })

        // Reset form with updated data (keep testing states)
        form.reset(data)
      } catch (error) {
        console.error('Failed to save public content notifications:', error)

        toast({
          title: 'Error',
          description: 'Failed to save public content notifications settings',
          variant: 'destructive',
        })

        // Re-throw the error so calling functions can handle it
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [updateConfig, toast, form],
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

        toast({
          description: `Public content notifications ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
          variant: 'default',
        })
      } catch (error) {
        console.error('Failed to toggle public content notifications:', error)

        toast({
          title: 'Error',
          description: `Failed to ${newEnabledState ? 'enable' : 'disable'} public content notifications`,
          variant: 'destructive',
        })

        // Re-throw the error for the component to handle
        throw error
      } finally {
        setIsToggling(false)
      }
    },
    [updateConfig, form, toast],
  )

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (config?.publicContentNotifications) {
      const formValues = {
        enabled: config.publicContentNotifications.enabled || false,
        discordWebhookUrls:
          config.publicContentNotifications.discordWebhookUrls || '',
        discordWebhookUrlsMovies:
          config.publicContentNotifications.discordWebhookUrlsMovies || '',
        discordWebhookUrlsShows:
          config.publicContentNotifications.discordWebhookUrlsShows || '',
        appriseUrls: config.publicContentNotifications.appriseUrls || '',
        appriseUrlsMovies:
          config.publicContentNotifications.appriseUrlsMovies || '',
        appriseUrlsShows:
          config.publicContentNotifications.appriseUrlsShows || '',
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

        toast({
          description: `${fieldLabels[fieldName as string]} have been cleared`,
          variant: 'default',
        })
      } catch (error) {
        console.error(`Failed to clear ${fieldName}:`, error)

        toast({
          title: 'Error',
          description: `Failed to clear ${fieldName}`,
          variant: 'destructive',
        })

        // Re-throw the error for the component to handle
        throw error
      } finally {
        setIsClearing(false)
      }
    },
    [updateConfig, form, toast],
  )

  return {
    form,
    isSubmitting,
    isToggling,
    isClearing,
    testStatus,
    onSubmit,
    handleCancel,
    handleToggle,
    handleTestDiscordWebhook,
    handleClearField,
  }
}
